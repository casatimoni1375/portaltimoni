import { planRotativoRestore } from "@/lib/rotativo-restore";
import { applyOfficialRotativoModel } from "@/lib/rotativo-official-model";
import { withStandardizationLock } from "@/lib/rotativo-standardization-lock";
import { google, type sheets_v4 } from "googleapis";
import { NextResponse } from "next/server";
import { requireModuleAuthorization } from "@/lib/authorization-server";
import { deleteSupplierStandardization } from "@/lib/rotating-stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKUP_PREFIX = "BKP_ROTATIVO_";

function backupTitle(sheetName: string) {
  const sanitized = sheetName.replace(/[\\/?*\[\]:]/g, " ").trim();
  return `${BACKUP_PREFIX}${sanitized}`.slice(0, 100);
}

async function context() {
  const gate = await requireModuleAuthorization("estoque-rotativo", "administrar");
  if (!gate.current) throw new Error("Seu acesso não permite esta ação.");
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: gate.current.accessToken });
  return { sheets: google.sheets({ version: "v4", auth: oauth }) };
}

async function spreadsheetSheets(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title,index,hidden,gridProperties)",
  });
  return response.data.sheets || [];
}

async function createBackup(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string) {
  const available = await spreadsheetSheets(sheets, spreadsheetId);
  const source = available.find((sheet) => sheet.properties?.title === sheetName);
  const sourceId = source?.properties?.sheetId;
  if (sourceId === undefined || sourceId === null) throw new Error("A aba selecionada não foi encontrada.");

  const title = backupTitle(sheetName);
  const existing = available.find((sheet) => sheet.properties?.title === title);
  if (existing) return;

  const duplicated = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        duplicateSheet: {
          sourceSheetId: sourceId,
          insertSheetIndex: Math.max(0, Number(source?.properties?.index || 0) + 1),
          newSheetName: title,
        },
      }],
    },
  });
  const backupId = duplicated.data.replies?.[0]?.duplicateSheet?.properties?.sheetId;
  if (backupId === undefined || backupId === null) throw new Error("Não foi possível criar o ponto de restauração da planilha.");

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: backupId, hidden: true },
          fields: "hidden",
        },
      }],
    },
  });
}

async function setA1Overflow(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string) {
  return withStandardizationLock(spreadsheetId, () => applyOfficialRotativoModel(sheets, spreadsheetId, sheetName));
}

async function restoreBackup(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string) {
  const available = await spreadsheetSheets(sheets, spreadsheetId);
  const source = available.find((sheet) => sheet.properties?.title === sheetName);
  const backup = available.find((sheet) => sheet.properties?.title === backupTitle(sheetName));
  const sourceId = source?.properties?.sheetId;
  const backupId = backup?.properties?.sheetId;
  if (sourceId === undefined || sourceId === null) throw new Error("A aba padronizada não foi encontrada.");
  if (backupId === undefined || backupId === null) return false;

  const snapshot = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [sheetName, backupTitle(sheetName)].map(title => `'${title.replace(/'/g, "''")}'`),
    includeGridData: true,
  });
  const original = snapshot.data.sheets?.find(sheet => sheet.properties?.sheetId === sourceId);
  const saved = snapshot.data.sheets?.find(sheet => sheet.properties?.sheetId === backupId);
  if (!original || !saved) throw new Error("Não foi possível ler a aba original e o backup.");
  const requests = planRotativoRestore(original, saved);
  try {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }, { retry: false });
  } catch (cause) {
    const status = (cause as { response?: { status?: number } }).response?.status;
    if (status && [400, 401, 403, 404].includes(status)) throw cause;
    const error = new Error("Não foi possível confirmar a reversão. Não repita agora; confira a aba original e o backup antes de continuar.");
    error.name = "RotativoUncertainWriteError";
    throw error;
  }
  return true;
}

function apiError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  const permission = /insufficient|permission|forbidden|403/i.test(raw);
  const unauthorized = /não autorizado|não permite/i.test(raw);
  const message = permission ? "Sem acesso à planilha. Confirme o compartilhamento e entre novamente no Portal." : raw;
  return NextResponse.json({ ok: false, error: message }, { status: unauthorized || permission ? 403 : 400 });
}

export async function POST(request: Request) {
  try {
    const { sheets } = await context();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    const spreadsheetId = String(body.spreadsheetId || "").trim();
    const sheetName = String(body.sheetName || "").trim();
    if (!spreadsheetId || !sheetName) throw new Error("Planilha e aba são obrigatórias.");

    if (action === "criar_backup") {
      await withStandardizationLock(spreadsheetId, () => createBackup(sheets, spreadsheetId, sheetName));
      return NextResponse.json({ ok: true });
    }
    if (action === "ajustar_a1") {
      const result = await setA1Overflow(sheets, spreadsheetId, sheetName);
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "descartar_backup") {
      // Keep the restore point after approval; backup deletion is no longer implicit.
      return NextResponse.json({ ok: true });
    }
    if (action === "reverter") {
      const restored = await withStandardizationLock(spreadsheetId, async () => {
        const restored = await restoreBackup(sheets, spreadsheetId, sheetName);
        if (restored) await deleteSupplierStandardization(spreadsheetId, sheetName);
        return restored;
      });
      return NextResponse.json({ ok: true, restored });
    }
    throw new Error("Ação de padronização inválida.");
  } catch (error) {
    return apiError(error);
  }
}
