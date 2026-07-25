import { describe, expect, it } from 'vitest';

import { isTwitchChannel, parseTwitchChannel } from '@/features/presence/twitchChannel';

describe('Twitch channel detection', () => {
  it('finds a channel on a stream page', () => {
    expect(parseTwitchChannel('https://www.twitch.tv/Some_Channel')).toEqual({
      login: 'some_channel',
      url: 'https://www.twitch.tv/some_channel',
    });
  });

  it.each([
    'https://www.twitch.tv/',
    'https://www.twitch.tv/directory',
    'https://www.twitch.tv/following',
    'https://www.twitch.tv/search',
    'https://www.twitch.tv/videos/123',
    'https://example.com/some_channel',
    'not-a-url',
  ])('ignores non-channel page %s', (url) => {
    expect(parseTwitchChannel(url)).toBeNull();
  });

  it('rejects channel data that does not match its URL', () => {
    expect(
      isTwitchChannel({
        login: 'first_channel',
        url: 'https://www.twitch.tv/second_channel',
      }),
    ).toBe(false);
  });
});
