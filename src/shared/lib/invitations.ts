export type Role = "owner" | "admin" | "manager" | "analyst" | "viewer";

export const ROLE_CAPABILITIES: Record<Role, string[]> = {
  owner: [
    "Vollen Zugriff auf alle Bereiche und die Administration",
    "Benutzer einladen und Rollen zuweisen",
    "Rollen- und Berechtigungsmodell verwalten",
    "Integrationen und Datenexport steuern",
  ],
  admin: [
    "Dashboard und Integrationen verwalten",
    "Benutzerverwaltung (ohne Owner-Rechte)",
    "Datenexport in Reports",
  ],
  manager: [
    "Operative Dashboards und KPI-Ansichten",
    "Integrationsstatus einsehen",
    "Reports exportieren",
  ],
  analyst: [
    "Analyse- und KPI-Bereiche nutzen",
    "Auswertungen und Exporte erstellen",
  ],
  viewer: ["Lesender Zugriff auf freigegebene Dashboard-Bereiche"],
};

export function getRoleLabel(role: Role): string {
  return role.toUpperCase();
}

export function buildInvitationEmailHtml({
  inviterName,
  inviteeEmail,
  role,
  inviteUrl,
  appName,
  logoUrl,
}: {
  inviterName: string;
  inviteeEmail: string;
  role: Role;
  inviteUrl: string;
  appName: string;
  logoUrl: string;
}) {
  const capabilities = ROLE_CAPABILITIES[role]
    .map((item) => `<li style="margin-bottom:6px;">${item}</li>`)
    .join("");

  return `
  <div style="margin:0; padding:0; background:#0b1020; color:#e5e7eb; font-family:Inter, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table width="620" cellpadding="0" cellspacing="0" role="presentation" style="background:#111827; border:1px solid #334155; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 12px;" align="center">
                <img src="${logoUrl}" alt="PetRhein" width="240" style="display:block; max-width:100%; height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;">
                <h1 style="margin:0 0 10px; color:#f8fafc; font-size:24px; line-height:1.3;">
                  Einladung zum ${appName}
                </h1>
                <p style="margin:0 0 14px; color:#cbd5e1; font-size:15px; line-height:1.6;">
                  Hallo ${inviteeEmail},<br />
                  <strong>${inviterName}</strong> hat dich zum <strong>${appName}</strong> eingeladen.
                </p>
                <p style="margin:0 0 14px; color:#cbd5e1; font-size:15px;">
                  Zugewiesene Rolle: <strong style="color:#38bdf8;">${getRoleLabel(role)}</strong>
                </p>
                <div style="margin:14px 0 18px; padding:14px; border:1px solid #334155; border-radius:10px; background:#0f172a;">
                  <p style="margin:0 0 10px; color:#f8fafc; font-size:14px; font-weight:600;">Was du mit dieser Rolle kannst:</p>
                  <ul style="margin:0; padding-left:18px; color:#cbd5e1; font-size:14px; line-height:1.5;">
                    ${capabilities}
                  </ul>
                </div>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                  <tr>
                    <td style="background:#2563eb; border-radius:10px;">
                      <a href="${inviteUrl}" style="display:inline-block; padding:12px 18px; color:#ffffff; font-size:14px; text-decoration:none; font-weight:600;">
                        Einladung annehmen
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.5;">
                  Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />
                  <a href="${inviteUrl}" style="color:#60a5fa;">${inviteUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
}
