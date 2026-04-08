import test from 'node:test';
import assert from 'node:assert/strict';

import { __testUtils } from '../netlify/functions/admin-site-chatbot.mjs';

test('stripConversationalPrefix removes conversational openings including "what about" variants', () => {
  assert.equal(__testUtils.stripConversationalPrefix('what about the antichrist'), 'the antichrist');
  assert.equal(__testUtils.stripConversationalPrefix('What about... the antichrist?'), 'the antichrist');
  assert.equal(__testUtils.stripConversationalPrefix('how about, end times prophecy'), 'end times prophecy');
});

test('stripConversationalPrefix removes stacked prefixes while preserving meaningful query text', () => {
  assert.equal(
    __testUtils.stripConversationalPrefix('can you tell me about what about the millennium kingdom'),
    'the millennium kingdom'
  );
});
