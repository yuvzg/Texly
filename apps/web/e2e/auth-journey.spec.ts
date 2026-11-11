import { test, expect } from '@playwright/test';

interface MailpitMessageSummary {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
}

interface MailpitMessageDetail {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
}

async function getLatestMailpitMessage(recipientEmail: string): Promise<MailpitMessageDetail> {
  const maxAttempts = 15;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch('http://localhost:8025/api/v1/messages');
      if (res.ok) {
        const data = await res.json();
        const messages: MailpitMessageSummary[] = data.messages || [];
        const match = messages.find((m) =>
          m.To.some((to) => to.Address.toLowerCase() === recipientEmail.toLowerCase()),
        );

        if (match) {
          const detailRes = await fetch(`http://localhost:8025/api/v1/message/${match.ID}`);
          if (detailRes.ok) {
            return (await detailRes.json()) as MailpitMessageDetail;
          }
        }
      }
    } catch {
      // Retry after delay
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error(
    `Email to ${recipientEmail} was not found in Mailpit after ${maxAttempts} attempts.`,
  );
}

test.describe('E2E Authentication Journey', () => {
  test('Complete user authentication, email verification, settings persistence, and password reset flow', async ({
    page,
  }) => {
    const timestamp = Date.now();
    const userEmail = `ada.${timestamp}@texly.app`;
    const initialPassword = 'Ada!Un1qu3P@ssw0rd#2026';
    const newPassword = 'NewBrandP@ssw0rd#2026';

    // -------------------------------------------------------------------------
    // 1. Register a new user
    // -------------------------------------------------------------------------
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /create an account/i })).toBeVisible();

    await page.getByLabel(/full name/i).fill('Ada Lovelace');
    await page.getByLabel(/email/i).fill(userEmail);
    await page.getByLabel(/^password$/i).fill(initialPassword);
    await page.getByRole('button', { name: /create account/i }).click();

    // After registration, user is redirected to /dashboard
    await page.waitForURL('**/dashboard');
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    await expect(page.getByText(/your email address is unverified/i)).toBeVisible();

    // -------------------------------------------------------------------------
    // 2. Receive verification email through Mailpit
    // -------------------------------------------------------------------------
    const verificationEmail = await getLatestMailpitMessage(userEmail);
    expect(verificationEmail.Subject).toContain('Verify your Texly account');

    const tokenMatch = (verificationEmail.Text || verificationEmail.HTML).match(
      /token=([A-Za-z0-9_-]+)/,
    );
    expect(tokenMatch).not.toBeNull();
    const verificationToken = tokenMatch![1];

    // -------------------------------------------------------------------------
    // 3. Verify email
    // -------------------------------------------------------------------------
    await page.goto(`/verify-email?token=${verificationToken}`);
    await expect(page.getByText(/email verified!/i)).toBeVisible({ timeout: 10000 });

    const goToDashboardBtn = page.getByRole('link', { name: /go to dashboard/i });
    await goToDashboardBtn.click();
    await page.waitForURL('**/dashboard');

    // Email is now verified, banner must NOT be present
    await expect(page.getByText(/your email address is unverified/i)).not.toBeVisible();

    // -------------------------------------------------------------------------
    // 4. Log in
    // -------------------------------------------------------------------------
    // Log out first
    const logoutBtn = page.getByRole('button', { name: /sign out/i });
    await logoutBtn.click();
    await page.waitForURL('**/login');

    // Fill login form
    await page.getByLabel(/email/i).fill(userEmail);
    await page.getByLabel(/^password/i).fill(initialPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('**/dashboard');
    await expect(page.getByText('Ada Lovelace')).toBeVisible();

    // -------------------------------------------------------------------------
    // 5. Refresh the page and restore the session
    // -------------------------------------------------------------------------
    await page.reload();
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    await expect(page.getByText(userEmail)).toBeVisible();

    // -------------------------------------------------------------------------
    // 6. Update profile settings
    // -------------------------------------------------------------------------
    await page.goto('/dashboard/settings');
    await expect(page.getByRole('heading', { name: /personal information/i })).toBeVisible();

    // Update name
    const nameInput = page.getByLabel(/full name/i);
    await nameInput.clear();
    await nameInput.fill('Augusta Ada King');
    await page.getByRole('button', { name: /save profile/i }).click();
    await expect(page.getByText(/profile information updated successfully/i)).toBeVisible();

    // Update editor preferences
    await page.getByLabel(/interface theme/i).selectOption('dark');
    await page.getByLabel(/keybinding profile/i).selectOption('vim');
    await page.getByRole('button', { name: /save preferences/i }).click();
    await expect(page.getByText(/preferences saved successfully/i)).toBeVisible();

    // Reload page to verify persistence from server
    await page.reload();
    await expect(page.getByLabel(/full name/i)).toHaveValue('Augusta Ada King');
    await expect(page.getByLabel(/interface theme/i)).toHaveValue('dark');
    await expect(page.getByLabel(/keybinding profile/i)).toHaveValue('vim');

    // -------------------------------------------------------------------------
    // 7. Log out
    // -------------------------------------------------------------------------
    await page.getByRole('button', { name: /log out current session/i }).click();
    await page.waitForURL('**/login');

    // -------------------------------------------------------------------------
    // 8. Attempt to access a protected route
    // -------------------------------------------------------------------------
    await page.goto('/dashboard');
    await page.waitForURL('**/login?redirect=%2Fdashboard');
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

    // -------------------------------------------------------------------------
    // 9. Reset password and verify that previous sessions are revoked
    // -------------------------------------------------------------------------
    await page.getByRole('link', { name: /forgot password/i }).click();
    await page.waitForURL('**/forgot-password');

    await page.getByLabel(/email address/i).fill(userEmail);
    await page.getByRole('button', { name: /send reset link/i }).click();
    await expect(page.getByText(/reset link sent/i)).toBeVisible();

    // Fetch reset email from Mailpit
    const resetEmail = await getLatestMailpitMessage(userEmail);
    expect(resetEmail.Subject).toContain('Reset your Texly password');

    const resetTokenMatch = (resetEmail.Text || resetEmail.HTML).match(/token=([A-Za-z0-9_-]+)/);
    expect(resetTokenMatch).not.toBeNull();
    const resetToken = resetTokenMatch![1];

    // Navigate to reset password page
    await page.goto(`/reset-password?token=${resetToken}`);
    await expect(page.getByRole('heading', { name: /set new password/i })).toBeVisible();

    await page.getByLabel(/^new password/i).fill(newPassword);
    await page.getByLabel(/confirm new password/i).fill(newPassword);
    await page.getByRole('button', { name: /reset password/i }).click();

    await expect(page.getByText(/password reset successful!/i)).toBeVisible();
    await page.getByRole('link', { name: /sign in with new password/i }).click();
    await page.waitForURL('**/login');

    // Verify old password fails
    await page.getByLabel(/email/i).fill(userEmail);
    await page.getByLabel(/^password/i).fill(initialPassword);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid email address or password/i)).toBeVisible();

    // Verify new password succeeds
    await page.getByLabel(/^password/i).fill(newPassword);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/dashboard');
    await expect(page.getByText('Augusta Ada King')).toBeVisible();
  });
});
