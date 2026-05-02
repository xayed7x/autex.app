import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetEmail = searchParams.get('email');

  if (!targetEmail) {
    return NextResponse.json({ error: 'Please provide an email query parameter. Example: ?email=test@example.com' }, { status: 400 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const data = await resend.emails.send({
      from: 'Autex <onboarding@resend.dev>', // You can change this to your verified domain later
      to: targetEmail,
      subject: 'Vercel + Resend Connection Test',
      html: `
        <h1>It Works! 🚀</h1>
        <p>This email confirms that your <b>Vercel</b> application is successfully communicating with <b>Resend</b>.</p>
        <p>Even though your domain DNS is managed on Netlify, the connection is alive and well.</p>
        <br />
        <p>Timestamp: ${new Date().toLocaleString()}</p>
      `,
    });

    return NextResponse.json({ success: true, message: 'Test email sent!', data });
  } catch (error) {
    console.error('Test email failed:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
