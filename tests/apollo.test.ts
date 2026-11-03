import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apolloContactUrl, mapApolloContact } from '../lib/apollo-map';

test('apollo: maps a saved contact to a CRM lead', () => {
  const m = mapApolloContact({
    id: 'abc123', first_name: 'Priya', last_name: 'Nair', title: 'Marketing Head', email: ' Priya@Example.COM ',
    organization: { name: 'Acme Realty', website_url: 'acmerealty.in', industry: 'real estate' },
    phone_numbers: [{ raw_number: '+91 98450 00000', sanitized_number: '+919845000000' }],
    linkedin_url: 'http://www.linkedin.com/in/priya', created_at: '2026-11-03T06:00:00.000Z',
  })!;
  assert.equal(m.name, 'Priya Nair');
  assert.equal(m.email, 'priya@example.com', 'emails are lower-cased so duplicates match');
  assert.equal(m.company, 'Acme Realty');
  assert.equal(m.website, 'https://acmerealty.in/');
  assert.equal(m.phone, '+919845000000');
  assert.equal(m.title, 'Marketing Head');
  assert.equal(m.createdAt?.toISOString(), '2026-11-03T06:00:00.000Z');
});

test('apollo: skips contacts with no id or no name, and unsafe links', () => {
  assert.equal(mapApolloContact({ name: 'No id' }), null);
  assert.equal(mapApolloContact({ id: 'x' }), null);
  assert.equal(mapApolloContact({ id: 'x', email: 'a@b.com' })!.name, 'a@b.com', 'falls back to email');
  assert.equal(mapApolloContact({ id: 'x', name: 'A', linkedin_url: 'javascript:alert(1)' })!.linkedin, null);
  assert.equal(mapApolloContact({ id: 'x', name: 'A', created_at: 'not a date' })!.createdAt, null);
  assert.equal(apolloContactUrl('a b'), 'https://app.apollo.io/#/contacts/a%20b');
});
