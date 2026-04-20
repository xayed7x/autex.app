/**
 * Welcome Email Template
 * 
 * Sent when a new user signs up and their trial starts.
 * Design matches Autex Dashboard aesthetic.
 */

import { Button, Heading, Text, Hr, Section } from '@react-email/components';
import * as React from 'react';
import { BaseTemplate } from './base-template';

interface WelcomeEmailProps {
  businessName: string;
  trialEndDate: string;
}

export const WelcomeEmail = ({ businessName, trialEndDate }: WelcomeEmailProps) => (
  <BaseTemplate preview="Welcome to Autex AI! Your 14-day free trial has started.">
    {/* Header Badge */}
    <Section style={badgeContainer}>
      <Text style={badge}>🎉 Welcome</Text>
    </Section>
    
    <Heading style={heading}>Your AI Assistant is Ready!</Heading>
    
    <Text style={paragraph}>
      Hi <strong>{businessName}</strong>,
    </Text>
    
    <Text style={paragraph}>
      Welcome to Autex AI! Your <strong>14-day free trial</strong> has started. 
      We're excited to help you automate your F-commerce business.
    </Text>
    
    {/* Trial Info Box */}
    <Section style={infoBox}>
      <Text style={infoBoxText}>
        ⏰ <strong>Trial ends:</strong> {trialEndDate}
      </Text>
    </Section>
    
    <Hr style={divider} />
    
    <Text style={sectionTitle}>Get Started:</Text>
    
    <Section style={checklistContainer}>
      <Text style={checklistItem}>✅ Connect your Facebook Page</Text>
      <Text style={checklistItem}>✅ Add your products</Text>
      <Text style={checklistItem}>✅ Let AI handle customer inquiries</Text>
      <Text style={checklistItem}>✅ Collect orders automatically</Text>
    </Section>
    
    <Section style={buttonContainer}>
      <Button style={primaryButton} href="https://app.autexai.com/dashboard">
        Go to Dashboard →
      </Button>
    </Section>
    
    <Hr style={divider} />
    
    <Text style={helpText}>
      Questions? Reply to this email or WhatsApp us at{' '}
      <strong>01977994057</strong>
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
  backgroundColor: '#dcfce7', // green-100
  color: '#166534', // green-800
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

const infoBox = {
  backgroundColor: '#fef3c7', // amber-100
  padding: '16px 20px',
  borderRadius: '12px',
  margin: '24px 0',
  border: '1px solid #fde68a', // amber-200
};

const infoBoxText = {
  fontSize: '15px',
  color: '#92400e', // amber-800
  margin: '0',
  textAlign: 'center' as const,
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

const helpText = {
  fontSize: '14px',
  color: '#71717a', // zinc-500
  textAlign: 'center' as const,
  margin: '0',
};

export default WelcomeEmail;
