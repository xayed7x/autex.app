/**
 * Trial Ending Email Template
 * 
 * Sent 1 day before the trial expires.
 * Design matches Autex Dashboard aesthetic.
 */

import { Button, Heading, Text, Hr, Section } from '@react-email/components';
import * as React from 'react';
import { BaseTemplate } from './base-template';
import { SUBSCRIPTION_PLANS } from '../../subscription/utils';

interface TrialEndingEmailProps {
  businessName: string;
  expiryDate: string;
}

export const TrialEndingEmail = ({ businessName, expiryDate }: TrialEndingEmailProps) => (
  <BaseTemplate preview="Your Autex AI trial ends tomorrow! Don't lose access.">
    {/* Header Badge */}
    <Section style={badgeContainer}>
      <Text style={badge}>⏰ Reminder</Text>
    </Section>
    
    <Heading style={heading}>Your Trial Ends Tomorrow!</Heading>
    
    <Text style={paragraph}>
      Hi <strong>{businessName}</strong>,
    </Text>
    
    <Text style={paragraph}>
      Your Autex AI trial expires on <strong>{expiryDate}</strong>.
      After that, your bot will stop responding to customers.
    </Text>
    
    {/* Info Box */}
    <Section style={infoBox}>
      <Text style={infoBoxText}>
        💡 <strong>Enjoying Autex?</strong> Upgrade now to keep your AI running!
      </Text>
    </Section>
    
    <Hr style={divider} />
    
    <Text style={sectionTitle}>Choose Your Plan:</Text>
    
    {/* Pricing Cards */}
    <Section style={pricingContainer}>
      <table width="100%" cellPadding="0" cellSpacing="0" role="presentation">
        <tr>
          <td style={pricingCard}>
            <Text style={planName}>Starter</Text>
            <Text style={planPrice}>৳{SUBSCRIPTION_PLANS.starter.price.toLocaleString()}<span style={planPeriod}>/mo</span></Text>
            <Text style={planFeature}>500 Customers</Text>
          </td>
          <td width="12"></td>
          <td style={pricingCardHighlight}>
            <Text style={planBadge}>Popular</Text>
            <Text style={planName}>Growth</Text>
            <Text style={planPrice}>৳{SUBSCRIPTION_PLANS.growth.price.toLocaleString()}<span style={planPeriod}>/mo</span></Text>
            <Text style={planFeatureHighlight}>1,500 Customers</Text>
          </td>
          <td width="12"></td>
          <td style={pricingCard}>
            <Text style={planName}>Pro</Text>
            <Text style={planPrice}>৳{SUBSCRIPTION_PLANS.pro.price.toLocaleString()}<span style={planPeriod}>/mo</span></Text>
            <Text style={planFeature}>3,500 Customers</Text>
          </td>
        </tr>
      </table>
    </Section>
    
    <Section style={buttonContainer}>
      <Button style={primaryButton} href="https://wa.me/8801977994057?text=Hi%2C%20I%20want%20to%20upgrade%20my%20Autex%20subscription.">
        💬 Upgrade on WhatsApp
      </Button>
    </Section>
    
    <Text style={helpText}>
      Pay via bKash to <strong>01915969330</strong> and send screenshot on WhatsApp.
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
  backgroundColor: '#fef3c7', // amber-100
  color: '#92400e', // amber-800
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
  textAlign: 'center' as const,
};

const pricingContainer = {
  margin: '0 0 24px',
};

const pricingCard = {
  backgroundColor: '#f4f4f5', // zinc-100
  borderRadius: '12px',
  padding: '16px',
  textAlign: 'center' as const,
  verticalAlign: 'top' as const,
};

const pricingCardHighlight = {
  backgroundColor: '#18181b', // zinc-900
  borderRadius: '12px',
  padding: '16px',
  textAlign: 'center' as const,
  verticalAlign: 'top' as const,
  color: '#ffffff',
};

const planBadge = {
  fontSize: '10px',
  fontWeight: '600' as const,
  color: '#22c55e', // green-500
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  margin: '0 0 4px',
};

const planName = {
  fontSize: '14px',
  fontWeight: '600' as const,
  margin: '0 0 4px',
};

const planPrice = {
  fontSize: '20px',
  fontWeight: '700' as const,
  margin: '0',
};

const planPeriod = {
  fontSize: '12px',
  fontWeight: '400' as const,
  opacity: 0.7,
};

const planFeature = {
  fontSize: '11px',
  color: '#71717a', // zinc-500
  margin: '8px 0 0',
  fontWeight: '500' as const,
};

const planFeatureHighlight = {
  fontSize: '11px',
  color: '#a1a1aa', // zinc-400
  margin: '8px 0 0',
  fontWeight: '500' as const,
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '28px 0 16px',
};

const primaryButton = {
  backgroundColor: '#22c55e', // green-500
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
  fontSize: '13px',
  color: '#71717a', // zinc-500
  textAlign: 'center' as const,
  margin: '0',
};

export default TrialEndingEmail;
