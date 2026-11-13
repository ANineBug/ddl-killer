export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

// 用 Resend 发信：https://resend.com/docs/api-reference/emails/send-email
export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(to, subject, text) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    },
  };
}

// 本机开发没配 Resend 时，验证码直接打印在终端里
export function consoleMailer(): Mailer {
  return {
    async send(to, subject, text) {
      console.log(`[邮件] 给 ${to}：${subject}\n${text}`);
    },
  };
}
