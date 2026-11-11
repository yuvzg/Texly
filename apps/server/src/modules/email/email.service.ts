import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '../../logging/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSender {
  sendEmail(message: EmailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  pass?: string | undefined;
  from: string;
}

export class NodemailerEmailSender implements EmailSender {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user && config.pass
        ? {
            auth: {
              user: config.user,
              pass: config.pass,
            },
          }
        : {}),
    });
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      logger.info({ to: message.to, subject: message.subject }, 'Email sent successfully via SMTP');
    } catch (err: unknown) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), to: message.to },
        'Failed to send email via SMTP',
      );
      throw err;
    }
  }
}

export class MockEmailSender implements EmailSender {
  public sentEmails: EmailMessage[] = [];

  async sendEmail(message: EmailMessage): Promise<void> {
    this.sentEmails.push(message);
    logger.debug({ to: message.to, subject: message.subject }, 'MockEmailSender recorded email');
  }

  clear(): void {
    this.sentEmails = [];
  }
}

export class EmailService {
  constructor(
    private readonly sender: EmailSender,
    private readonly appUrl: string = 'http://localhost:3000',
  ) {}

  async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const verifyUrl = `${this.appUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const subject = 'Verify your Texly account';
    const text = `Hi ${name},\n\nPlease verify your Texly email address by clicking the link below:\n${verifyUrl}\n\nThis link will expire in 24 hours.\n\nBest regards,\nThe Texly Team`;
    const html = `
      <div style="font-family: sans-serif; line-height: 1.5; color: #111;">
        <h2>Verify your email address</h2>
        <p>Hi ${name},</p>
        <p>Thank you for signing up for Texly. Please click the button below to verify your email address:</p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}" style="background-color: #2563eb; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">
            Verify Email
          </a>
        </p>
        <p>Or copy and paste this URL into your browser:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p style="color: #666; font-size: 13px; margin-top: 32px;">This link will expire in 24 hours.</p>
      </div>
    `;

    try {
      await this.sender.sendEmail({ to, subject, html, text });
    } catch (err: unknown) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), to },
        'Non-blocking error delivering verification email',
      );
    }
  }

  async sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
    const resetUrl = `${this.appUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const subject = 'Reset your Texly password';
    const text = `Hi ${name},\n\nWe received a request to reset your Texly password. Click the link below to set a new password:\n${resetUrl}\n\nThis link will expire in 30 minutes.\n\nIf you did not request a password reset, you can safely ignore this email.\n\nBest regards,\nThe Texly Team`;
    const html = `
      <div style="font-family: sans-serif; line-height: 1.5; color: #111;">
        <h2>Reset your Texly password</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password. Click the button below to choose a new password:</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #dc2626; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">
            Reset Password
          </a>
        </p>
        <p>Or copy and paste this URL into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p style="color: #666; font-size: 13px; margin-top: 32px;">This link will expire in 30 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `;

    try {
      await this.sender.sendEmail({ to, subject, html, text });
    } catch (err: unknown) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), to },
        'Non-blocking error delivering password reset email',
      );
    }
  }
}
