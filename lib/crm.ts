// Fixed lists so CRM reports group cleanly. Add new options at the end; old leads keep their value.
export const LEAD_STAGES = ['NEW', 'QUALIFIED', 'MEETING', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;

export const LEAD_SOURCES = ['Referral', 'LinkedIn', 'Website', 'Instagram', 'Google Ads', 'Meta Ads', 'Cold outreach', 'Event', 'Existing client', 'Other', 'Apollo'] as const;

export const LOST_REASONS = ['Price', 'Chose a competitor', 'No budget', 'No response', 'Timing / not now', 'Not a fit', 'Other'] as const;
