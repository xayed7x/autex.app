/**
 * Admin Notification - New User Signup
 * 
 * Sent to admin when a new user creates an account.
 */

import { Heading, Text, Hr, Section } from '@react-email/components';
import * as React from 'react';
import { BaseTemplate } from './base-template';

interface AdminNewUserEmailProps {
  userName: string;
  userEmail: string;
  businessName: string;
  signupDate: string;
  trialEndsAt: string;
  workspaceId?: string;
  phoneNumber?: string;
}

export const AdminNewUserEmail = ({ 
  userName,
  userEmail,
  businessName,
  signupDate,
  trialEndsAt,
  workspaceId,
  phoneNumber,
}: AdminNewUserEmailProps) => (
  <BaseTemplate preview={`🆕 New User: ${businessName} just signed up!`}>
    {/* Header Badge */}
    <Section style={badgeContainer}>
      <Text style={badge}>🆕 New Signup</Text>
    </Section>
    
    <Heading style={heading}>New User Alert!</Heading>
    
    <Text style={paragraph}>
      A new user just created an account on Autex AI. Here are the details of the new business:
    </Text>
    
    {/* User Details Box */}
    <Section style={detailsBox}>
      <table width="100%" cellPadding="0" cellSpacing="0" role="presentation">
        <tr>
          <td style={detailLabel}>Business Name</td>
          <td style={detailValue}>{businessName}</td>
        </tr>
        <tr>
          <td style={detailLabel}>Owner Name</td>
          <td style={detailValue}>{userName}</td>
        </tr>
        <tr>
          <td style={detailLabel}>Email</td>
          <td style={detailValue}>{userEmail}</td>
        </tr>
        {phoneNumber && (
          <tr>
            <td style={detailLabel}>Phone</td>
            <td style={detailValue}>{phoneNumber}</td>
          </tr>
        )}
        <tr>
          <td style={detailLabel}>Signed Up</td>
          <td style={detailValue}>{signupDate}</td>
        </tr>
        <tr>
          <td style={detailLabel}>Trial Ends</td>
          <td style={detailValue}>{trialEndsAt}</td>
        </tr>
      </table>
    </Section>
    
    {workspaceId && (
      <Section style={buttonContainer}>
        <Button style={primaryButton} href={`https://autexai.com/admin/workspaces/${workspaceId}`}>
          Manage Workspace →
        </Button>
      </Section>
    )}

    <Hr style={divider} />
    
    <Text style={sectionTitle}>Recommended Actions:</Text>
    
    <Section style={checklistContainer}>
      <Text style={checklistItem}>👋 Send a welcome WhatsApp message</Text>
      <Text style={checklistItem}>📞 Call within 24 hours to help setup</Text>
      <Text style={checklistItem}>🎯 Guide them to connect Facebook Page</Text>
      <Text style={checklistItem}>📦 Help them add their first products</Text>
    </Section>
    
    <Text style={helpText}>
      Proactive support = Happy customers = More conversions! 🚀
    </Text>
  </BaseTemplate>
);

// ============================================
// STYLES
// ============================================

const badgeContainer = {
  textAlign: 'center' as const,
  marginBottom: '16px',
};

const badge = {
  display: 'inline-block',
  backgroundColor: '#dbeafe', // blue-100
  color: '#1e40af', // blue-800
  padding: '6px 16px',
  borderRadius: '9999px',
  fontSize: '14px',
  fontWeight: '600' as const,
  margin: '0',
};

const heading = {
  fontSize: '28px',
  fontWeight: '700' as const,
  color: '#18181b', // zinc-900
  textAlign: 'center' as const,
  margin: '0 0 24px',
  lineHeight: '1.3',
  letterSpacing: '-0.025em',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#3f3f46', // zinc-700
  margin: '0 0 16px',
};

const detailsBox = {
  backgroundColor: '#f4f4f5', // zinc-100
  padding: '20px',
  borderRadius: '12px',
  margin: '24px 0',
};

const detailLabel = {
  fontSize: '13px',
  color: '#71717a', // zinc-500
  padding: '6px 0',
  width: '120px',
};

const detailValue = {
  fontSize: '14px',
  fontWeight: '600' as const,
  color: '#18181b', // zinc-900
  padding: '6px 0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '28px 0',
};

const primaryButton = {
  backgroundColor: '#18181b', // zinc-900
  borderRadius: '10px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 28px',
};

const divider = {
  borderColor: '#e4e4e7', // zinc-200
  margin: '28px 0',
};

const sectionTitle = {
  fontSize: '14px',
  fontWeight: '600' as const,
  color: '#71717a', // zinc-500
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0 0 16px',
};

const checklistContainer = {
  margin: '0 0 24px',
};

const checklistItem = {
  fontSize: '15px',
  color: '#3f3f46', // zinc-700
  margin: '8px 0',
  paddingLeft: '4px',
};

const helpText = {
  fontSize: '14px',
  color: '#71717a', // zinc-500
  textAlign: 'center' as const,
  margin: '0',
  fontStyle: 'italic' as const,
};

export default AdminNewUserEmail;
