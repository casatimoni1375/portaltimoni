export type TeamUnit = "Geral" | "Araras" | "Rio Claro";

export type TeamMember = {
  name: string;
  unit: TeamUnit;
};

// A relação de colaboradores NÃO fica escrita no código.
// A fonte oficial é o cadastro (aba PortalColaboradores da planilha de configuração).
export const TEAM_MEMBERS: TeamMember[] = [];
