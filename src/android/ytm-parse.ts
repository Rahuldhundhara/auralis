import type {
  AlbumRef,
  ArtistRef,
  BrowsePage,
  Card,
  ItemType,
  NavEndpoint,
  NextResult,
  PageHeader,
  SearchResults,
  Shelf,
  Track,
} from '../../shared/types';

export type Raw = any;

export const textOf = (value: Raw): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textOf).join('');
  if (value.simpleText) return String(value.simpleText);
  if (Array.isArray(value.runs)) return value.runs.map((r: Raw) => r?.text ?? '').join('');
  return '';
};

const runsOf = (value: Raw): Raw[] => (Array.isArray(value?.runs) ? value.runs : []);

export function endpointOf(value: Raw): NavEndpoint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const browse = value.browseEndpoint;
  if (browse?.browseId) {
    return {
      browseId: browse.browseId,
      params: browse.params || undefined,
    };
  }
  const watch = value.watchEndpoint;
  if (watch?.videoId) {
    return {
      videoId: watch.videoId,
      playlistId: watch.playlistId || undefined,
      playlistSetVideoId: watch.playlistSetVideoId || undefined,
      index: typeof watch.index === 'number' ? watch.index : undefined,
      params: watch.params || undefined,
    };
  }
  const watchPlaylist = value.watchPlaylistEndpoint;
  if (watchPlaylist?.playlistId) {
    return { playlistId: watchPlaylist.playlistId, params: watchPlaylist.params || undefined };
  }
  const search = value.searchEndpoint;
  if (search?.query) return { query: search.query };
  return undefined;
}

export function pageTypeOf(value: Raw): string | undefined {
  return (
    value?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType ||
    value?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType
  );
}

const THUMBNAIL_TARGET = 512;

function capImageUrl(url: string): string {
  // YouTube Music image URLs end with a size directive such as
  // "=w1200-h1200-l90-rj". Requesting a smaller decode cuts WebView memory
  // dramatically on Android without changing the visible image.
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    if (/=w\d+-h\d+/.test(url)) {
      return url.replace(/=w\d+-h\d+/, `=w${THUMBNAIL_TARGET}-h${THUMBNAIL_TARGET}`);
    }
    if (/=s\d+/.test(url)) {
      return url.replace(/=s\d+/, `=s${THUMBNAIL_TARGET}`);
    }
  }
  return url;
}

export function thumbnailsOf(value: Raw): string | undefined {
  const lists: Raw[] = [];
  const walk = (node: Raw, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node.thumbnails)) lists.push(node.thumbnails);
    for (const [key, child] of Object.entries(node)) {
      if (key === 'thumbnails') continue;
      if (child && typeof child === 'object') walk(child, depth + 1);
    }
  };
  walk(value);
  const flat = lists.flat().filter((t) => typeof t?.url === 'string');
  if (!flat.length) return undefined;
  flat.sort(
    (a, b) =>
      Math.max(a.width || 0, a.height || 0) - Math.max(b.width || 0, b.height || 0),
  );
  // Pick the smallest variant large enough for cards and the player, instead
  // of the 1200px hero image that used to be attached to every queue row.
  const chosen =
    flat.find((t) => Math.max(t.width || 0, t.height || 0) >= THUMBNAIL_TARGET) ||
    flat[flat.length - 1];
  let url: string = chosen.url;
  if (url.startsWith('//')) url = `https:${url}`;
  return capImageUrl(url);
}

export function parseDuration(text: string): number {
  const cleaned = (text || '').trim().replace(/[^\d:]/g, '');
  if (!cleaned) return 0;
  const parts = cleaned.split(':').map((p) => Number(p) || 0);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

const DURATION_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;

function isDuration(text: string): boolean {
  return DURATION_RE.test((text || '').trim());
}

function firstEndpointNav(renderer: Raw): Raw {
  return (
    renderer?.navigationEndpoint ||
    renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint ||
    renderer?.playNavigationEndpoint ||
    {}
  );
}

function navigationPageType(renderer: Raw): string | undefined {
  return (
    pageTypeOf(firstEndpointNav(renderer)) ||
    pageTypeOf(renderer?.title) ||
    pageTypeOf(renderer?.subtitle) ||
    undefined
  );
}

function explicitOf(renderer: Raw): boolean {
  const badges = [
    ...(renderer?.badges || []),
    ...(renderer?.subtitle?.runs || []).flatMap((r: Raw) => r?.badges || []),
    ...(renderer?.title?.runs || []).flatMap((r: Raw) => r?.badges || []),
  ];
  return badges.some((b: Raw) => {
    const icon = b?.musicInlineBadgeRenderer?.icon?.iconType || b?.metadataBadgeRenderer?.icon?.iconType;
    return typeof icon === 'string' && icon.includes('EXPLICIT');
  });
}

function typeFromPageType(pageType?: string, fallback: ItemType = 'playlist'): ItemType {
  switch (pageType) {
    case 'MUSIC_PAGE_TYPE_ALBUM':
      return 'album';
    case 'MUSIC_PAGE_TYPE_ARTIST':
      return 'artist';
    case 'MUSIC_PAGE_TYPE_PLAYLIST':
      return 'playlist';
    case 'MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE':
      return 'podcast';
    case 'MUSIC_PAGE_TYPE_PODCAST_EPISODE':
    case 'MUSIC_PAGE_TYPE_NON_MUSIC_AUDIO_TRACK_PAGE':
      return 'episode';
    case 'MUSIC_PAGE_TYPE_USER_CHANNEL':
      return 'profile';
    case 'MUSIC_PAGE_TYPE_TRACK_LYRICS':
      return 'song';
    default:
      return fallback;
  }
}

function typeFromId(id: string | undefined, fallback: ItemType): ItemType {
  if (!id) return fallback;
  if (id.startsWith('MPREb_')) return 'album';
  if (id.startsWith('MPSP')) return 'podcast';
  if (id.startsWith('MPTR')) return 'song';
  if (id.startsWith('UC') || id.startsWith('FEmusic_library_privately_owned_artist')) return 'artist';
  if (id.startsWith('VL') || id.startsWith('PL') || id.startsWith('OLAK5uy')) return 'playlist';
  return fallback;
}

export function parseSubtitleRuns(runs: Raw[]): {
  artists: ArtistRef[];
  album?: AlbumRef;
  duration: number;
  text: string;
  year?: string;
} {
  const artists: ArtistRef[] = [];
  let album: AlbumRef | undefined;
  let duration = 0;
  let year: string | undefined;
  const textParts: string[] = [];
  for (const run of runs || []) {
    const text = (run?.text || '').trim();
    if (!text) continue;
    const endpoint = endpointOf(run?.navigationEndpoint);
    if (isDuration(text)) {
      duration = parseDuration(text);
      continue;
    }
    if (/^\d{4}$/.test(text)) {
      year = text;
      continue;
    }
    if (text === '•' || text === '·' || text === '|') continue;
    if (/^[\d,.]+\s*(?:[KMB])?\s*(?:plays?|views?|likes?|subscribers?)$/i.test(text)) continue;
    if (/^(explicit|clean)$/i.test(text)) continue;
    textParts.push(text);
    const type = pageTypeOf(run?.navigationEndpoint);
    if (endpoint?.browseId || type) {
      if (type === 'MUSIC_PAGE_TYPE_ARTIST' || endpoint?.browseId?.startsWith('UC')) {
        if (!artists.some((a) => a.name === text)) artists.push({ id: endpoint?.browseId, name: text });
      } else if (type === 'MUSIC_PAGE_TYPE_ALBUM' || endpoint?.browseId?.startsWith('MPREb_')) {
        album = { id: endpoint?.browseId, name: text };
      }
    }
  }
  if (!artists.length) {
    const first = (runs || []).find((r) => {
      const t = (r?.text || '').trim();
      return (
        t &&
        !isDuration(t) &&
        !/^\d{4}$/.test(t) &&
        t !== '•' &&
        t !== '·' &&
        !/^[\d,.]+\s*(?:[KMB])?\s*(?:plays?|views?|likes?|subscribers?)$/i.test(t) &&
        !/^(explicit|clean)$/i.test(t)
      );
    });
    if (first) artists.push({ name: (first.text || '').trim() });
  }
  return { artists, album, duration, text: textParts.join(' • '), year };
}

function parsePlaylistContext(renderer: Raw): Pick<Track, 'playlistId' | 'setVideoId' | 'libraryAddToken' | 'libraryRemoveToken'> {
  const playEndpoint =
    renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
  const watch = playEndpoint?.watchEndpoint || renderer?.navigationEndpoint?.watchEndpoint;
  const result: any = {
    playlistId: watch?.playlistId || undefined,
    setVideoId: renderer?.playlistSetVideoId || watch?.playlistSetVideoId || undefined,
  };
  const tokens = menuTokens(renderer);
  result.libraryAddToken = tokens.add;
  result.libraryRemoveToken = tokens.remove;
  return result;
}

function menuTokens(renderer: Raw): { add?: string; remove?: string } {
  const out: { add?: string; remove?: string } = {};
  const visit = (node: Raw, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 8) return;
    const text = (
      textOf(node?.menuServiceItemRenderer?.text) ||
      textOf(node?.menuNavigationItemRenderer?.text) ||
      textOf(node?.toggleMenuServiceItemRenderer?.defaultText) ||
      textOf(node?.toggleMenuServiceItemRenderer?.toggledText)
    ).toLowerCase();
    const feedback =
      node?.menuServiceItemRenderer?.serviceEndpoint?.feedbackEndpoint?.feedbackToken ||
      node?.feedbackEndpoint?.feedbackToken ||
      node?.menuServiceItemRenderer?.navigationEndpoint?.feedbackEndpoint?.feedbackToken;
    if (feedback && text) {
      if (text.includes('remove') && (text.includes('library') || text.includes('liked'))) out.remove = feedback;
      else if (text.includes('library') || text.includes('liked')) out.add = feedback;
    }
    for (const child of Object.values(node)) visit(child, depth + 1);
  };
  visit(renderer?.menu);
  return out;
}

/** musicResponsiveListItemRenderer (tracks, rows, search results). */
export function parseResponsiveItem(
  renderer: Raw,
  fallbackType?: 'song' | 'video' | 'episode',
): Track | undefined {
  if (!renderer) return undefined;
  const columns = (renderer.flexColumns || []).map((c: Raw) =>
    textOf(c?.musicResponsiveListItemFlexColumnRenderer?.text),
  );
  const title = (columns[0] || '').trim();
  const nav = firstEndpointNav(renderer);
  const watchId =
    renderer?.playlistItemData?.videoId ||
    nav?.watchEndpoint?.videoId ||
    renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint?.videoId;
  if (!title) return undefined;
  const type: Track['type'] = fallbackType || (renderer?.playlistItemData?.videoId ? 'song' : 'video');
  const subtitleRuns: Raw[] = [];
  for (const column of renderer.flexColumns || []) {
    const runs = column?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
    if (Array.isArray(runs)) subtitleRuns.push(...runs);
  }
  // Skip the first column's title runs.
  const firstRunsCount = renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.length || 0;
  const parsedSubtitle = parseSubtitleRuns(subtitleRuns.slice(firstRunsCount));
  const fixed = (renderer.fixedColumns || [])
    .map((c: Raw) => textOf(c?.musicResponsiveListItemFixedColumnRenderer?.text))
    .join(' ');
  const duration = parsedSubtitle.duration || parseDuration(fixed);
  const id = watchId || renderer?.navigationEndpoint?.browseEndpoint?.browseId;
  if (!id) return undefined;
  const videoType =
    nav?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
  const context = parsePlaylistContext(renderer);
  return {
    id,
    type,
    title,
    artists: parsedSubtitle.artists.length ? parsedSubtitle.artists : [{ name: '' }],
    album: parsedSubtitle.album,
    duration,
    thumbnail: thumbnailsOf(renderer.thumbnail),
    explicit: explicitOf(renderer),
    isVideo: type === 'video' || (videoType && videoType !== 'MUSIC_VIDEO_TYPE_ATV' ? true : undefined),
    ...context,
    source: 'youtube',
  };
}

/** musicTwoRowItemRenderer (album / playlist / artist cards). */
export function parseTwoRowItem(renderer: Raw): Card | undefined {
  if (!renderer) return undefined;
  const title = textOf(renderer.title).trim();
  const subtitle = textOf(renderer.subtitle).trim();
  const nav = firstEndpointNav(renderer);
  const endpoint = endpointOf(nav) || endpointOf(renderer?.title?.runs?.[0]?.navigationEndpoint);
  let id = endpoint?.browseId;
  if (!id && endpoint?.videoId) id = endpoint.videoId;
  if (!id && endpoint?.playlistId) id = endpoint.playlistId;
  if (!title || !id) return undefined;
  let type = typeFromPageType(navigationPageType(renderer), typeFromId(id, 'playlist'));
  if (type === 'playlist' && subtitle.startsWith('Album')) type = 'album';
  if (subtitle.startsWith('Single')) type = 'single';
  if (subtitle.startsWith('EP')) type = 'ep';
  return {
    type,
    id,
    title,
    subtitle,
    thumbnail: thumbnailsOf(renderer.thumbnailRenderer || renderer.thumbnail),
    round: type === 'artist',
    explicit: explicitOf(renderer),
    browseId: endpoint?.browseId,
    params: endpoint?.params,
    artists: parseSubtitleRuns(renderer.subtitle?.runs || []).artists,
    year: parseSubtitleRuns(renderer.subtitle?.runs || []).year,
    trackCount: (() => {
      const match = subtitle.match(/(\d+)\s+(songs?|tracks?|episodes?)/i);
      return match ? Number(match[1]) : undefined;
    })(),
  };
}

export function parsePlaylistPanelItem(renderer: Raw): { track: Track; selected: boolean } | undefined {
  if (!renderer) return undefined;
  const title = textOf(renderer.title).trim();
  const videoId = renderer.videoId || renderer?.navigationEndpoint?.watchEndpoint?.videoId;
  if (!title || !videoId) return undefined;
  const byline = parseSubtitleRuns(
    (renderer.longBylineText?.runs || renderer.shortBylineText?.runs || []).slice(),
  );
  const duration = parseDuration(textOf(renderer.lengthText)) || byline.duration || 0;
  const context = parsePlaylistContext(renderer);
  return {
    selected: Boolean(renderer.selected),
    track: {
      id: videoId,
      type: 'song',
      title,
      artists: byline.artists,
      album: byline.album,
      duration,
      thumbnail: thumbnailsOf(renderer.thumbnail),
      explicit: explicitOf(renderer),
      playlistId: renderer?.navigationEndpoint?.watchEndpoint?.playlistId || context.playlistId,
      setVideoId: renderer.playlistSetVideoId || context.setVideoId,
      libraryAddToken: context.libraryAddToken,
      libraryRemoveToken: context.libraryRemoveToken,
      source: 'youtube',
    },
  };
}

function humanDurationSeconds(text: string): number {
  const hours = /(\d+)\s*(?:hours?|hrs?|h)\b/i.exec(text);
  const minutes = /(\d+)\s*(?:minutes?|mins?|m)\b/i.exec(text);
  const seconds = /(\d+)\s*(?:seconds?|secs?|s)\b/i.exec(text);
  return (hours ? Number(hours[1]) * 3600 : 0) + (minutes ? Number(minutes[1]) * 60 : 0) + (seconds ? Number(seconds[1]) : 0);
}

function parseMultiRowItem(renderer: Raw): Track | undefined {
  const title = textOf(renderer?.title).trim();
  const watch = renderer?.onTap?.watchEndpoint || renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint;
  const id = watch?.videoId;
  if (!title || !id) return undefined;
  const durationText = textOf(renderer?.playbackProgress?.musicPlaybackProgressRenderer?.durationText);
  return {
    id,
    type: 'episode',
    title,
    artists: [],
    duration: humanDurationSeconds(durationText),
    thumbnail: thumbnailsOf(renderer?.thumbnail),
    isVideo: false,
    source: 'youtube',
  };
}

export function parseShelf(renderer: Raw, style: Shelf['style'] = 'carousel'): Shelf | undefined {
  const items: Card[] = [];
  let hasMultiRow = false;
  for (const item of renderer?.contents || []) {
    if (item?.musicTwoRowItemRenderer) {
      const card = parseTwoRowItem(item.musicTwoRowItemRenderer);
      if (card) items.push(card);
    } else if (item?.musicResponsiveListItemRenderer) {
      const track = parseResponsiveItem(item.musicResponsiveListItemRenderer);
      if (track) {
        items.push({
          type: track.type,
          id: track.id,
          title: track.title,
          subtitle: track.artists.map((a) => a.name).filter(Boolean).join(', ') + (track.album?.name ? ` • ${track.album.name}` : ''),
          thumbnail: track.thumbnail,
          explicit: track.explicit,
          track,
          artists: track.artists,
        });
      }
    } else if (item?.musicMultiRowListItemRenderer) {
      const track = parseMultiRowItem(item.musicMultiRowListItemRenderer);
      if (track) {
        hasMultiRow = true;
        items.push({
          type: 'episode',
          id: track.id,
          title: track.title,
          subtitle: textOf(item.musicMultiRowListItemRenderer.subtitle).trim(),
          thumbnail: track.thumbnail,
          track,
          artists: [],
        });
      }
    }
  }
  if (!items.length) return undefined;
  const header = renderer?.header?.musicCarouselShelfBasicHeaderRenderer;
  const title = textOf(header?.title).trim() || (style === 'grid' ? undefined : hasMultiRow ? 'Episodes' : '');
  const more = header?.moreContentButton?.buttonRenderer?.navigationEndpoint;
  return {
    title: title || undefined,
    subtitle: textOf(header?.strapline).trim() || undefined,
    items,
    endpoint: endpointOf(more),
    browseId: endpointOf(more)?.browseId,
    params: endpointOf(more)?.params,
    style,
  };
}

function argbToHex(value: unknown): string | undefined {
  if (typeof value !== 'number') return undefined;
  return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function parseGrid(renderer: Raw): Shelf | undefined {
  const items: Card[] = [];
  const header = renderer?.header?.gridHeaderRenderer;
  const heading = textOf(header?.title).trim() || undefined;
  for (const item of renderer?.items || []) {
    if (item?.musicTwoRowItemRenderer) {
      const card = parseTwoRowItem(item.musicTwoRowItemRenderer);
      if (card) items.push(card);
    } else if (item?.musicNavigationButtonRenderer) {
      const button = item.musicNavigationButtonRenderer;
      const title = textOf(button?.buttonText).trim();
      const endpoint = button?.clickCommand?.browseEndpoint;
      if (!title || !endpoint?.browseId) continue;
      items.push({
        type: 'mood',
        id: `${endpoint.browseId}:${endpoint.params || title}`,
        browseId: endpoint.browseId,
        params: endpoint.params,
        title,
        subtitle: heading || 'Mood & genre',
        color: argbToHex(button?.solid?.leftStripeColor),
      });
    }
  }
  if (!items.length) return undefined;
  return {
    title: heading,
    items,
    style: 'grid',
  };
}

export function continuationOf(value: Raw): string | undefined {
  const cont = value?.continuations;
  if (!Array.isArray(cont)) return undefined;
  for (const c of cont) {
    const token =
      c?.nextContinuationData?.continuation ||
      c?.nextRadioContinuationData?.continuation ||
      c?.reloadContinuationData?.continuation ||
      c?.nextContinuationData?.clickTrackingParams;
    if (typeof token === 'string' && token.length > 20) return token;
  }
  return undefined;
}

/** Every section list in the response, in visual order. */
function sectionListsOf(json: Raw): Raw[] {
  const lists: Raw[] = [];
  const add = (sl: Raw) => {
    if (sl && !lists.includes(sl)) lists.push(sl);
  };
  const contents = json?.contents;
  const single = contents?.singleColumnBrowseResultsRenderer;
  const two = contents?.twoColumnBrowseResultsRenderer;
  for (const tabs of [single?.tabs, two?.tabs]) {
    for (const tab of tabs || []) {
      add(tab?.tabRenderer?.content?.sectionListRenderer);
      add(tab?.expandableTabRenderer?.content?.sectionListRenderer);
    }
  }
  add(contents?.sectionListRenderer);
  add(single?.sectionListRenderer);
  add(two?.primaryContents?.sectionListRenderer);
  add(two?.secondaryContents?.sectionListRenderer);
  if (!lists.length) {
    // Search for the first section list anywhere (related shelves, dialogs, etc.)
    const find = (node: Raw, depth = 0): Raw => {
      if (!node || typeof node !== 'object' || depth > 10) return undefined;
      if (node.sectionListRenderer) return node.sectionListRenderer;
      for (const child of Object.values(node)) {
        const found = find(child, depth + 1);
        if (found) return found;
      }
      return undefined;
    };
    const found = find(json);
    if (found) add(found);
  }
  return lists;
}

/**
 * Collects every section-list content node in a well-defined order, flattening
 * the common one/two-column wrappers and item sections.
 */
function collectSectionContents(json: Raw): { contents: Raw[]; chips: Raw[]; continuation?: string } {
  const lists = sectionListsOf(json);
  if (!lists.length) return { contents: [], chips: [] };

  const contents: Raw[] = [];
  const chips: Raw[] = [];
  let cont: string | undefined;
  const push = (node: Raw) => {
    if (!node) return;
    if (node.musicCarouselShelfRenderer || node.musicShelfRenderer || node.musicPlaylistShelfRenderer || node.gridRenderer) {
      contents.push(node);
      return;
    }
    if (node.itemSectionRenderer) {
      for (const child of node.itemSectionRenderer.contents || []) push(child);
      return;
    }
    if (node.musicCardShelfRenderer) {
      contents.push(node);
      return;
    }
    if (node.musicDescriptionShelfRenderer) {
      contents.push(node);
      return;
    }
  };
  for (const sectionList of lists) {
    for (const node of sectionList.contents || []) push(node);
    const headerChips = sectionList?.header?.chipCloudRenderer?.chips || [];
    chips.push(...headerChips);
    cont = continuationOf(sectionList) || cont;
  }
  const extraChips =
    json?.contents?.singleColumnBrowseResultsRenderer?.header?.chipCloudRenderer?.chips ||
    json?.contents?.twoColumnBrowseResultsRenderer?.header?.chipCloudRenderer?.chips ||
    [];
  chips.push(...extraChips);
  return {
    contents,
    chips,
    continuation: cont || continuationOf(json?.contents),
  };
}

function parseChips(chips: Raw[]): BrowsePage['chips'] {
  const out: NonNullable<BrowsePage['chips']> = [];
  for (const chip of chips || []) {
    const text = textOf(chip?.chipCloudChipRenderer?.text).trim();
    if (!text) continue;
    const nav =
      chip?.chipCloudChipRenderer?.navigationEndpoint ||
      chip?.chipCloudChipRenderer?.onTap?.navigationEndpoint || {};
    const endpoint = endpointOf(nav);
    out.push({
      title: text,
      endpoint: endpoint || (nav?.browseEndpoint?.params ? { params: nav.browseEndpoint.params } : undefined),
      selected: Boolean(chip?.chipCloudChipRenderer?.isSelected),
    });
  }
  return out;
}

function parseHeaderInternal(renderer: Raw, expected: PageHeader['type']): PageHeader | undefined {
  if (!renderer) return undefined;
  const title = textOf(renderer.title).trim();
  if (!title) return undefined;
  const subtitle = textOf(renderer.subtitle).trim();
  const descriptionRuns = renderer.description?.runs
    ? renderer.description.runs
    : renderer.description?.musicDescriptionShelfRenderer?.description?.runs;
  const description = textOf({ runs: descriptionRuns || [] }).trim();
  const secondSubtitle = textOf(renderer.secondSubtitle).trim();
  const meta = secondSubtitle
    .split('•')
    .map((s) => s.trim())
    .filter(Boolean);
  if (subtitle) meta.unshift(subtitle);
  const thumb =
    thumbnailsOf(renderer.thumbnail) ||
    thumbnailsOf(renderer.heroImage?.image?.sources) ||
    thumbnailsOf(renderer.foregroundThumbnail);
  const trackCountMatch = secondSubtitle.match(/(\d+)\s+(songs?|tracks?|episodes?)/i);
  const yearMatch = secondSubtitle.match(/\b(19|20)\d{2}\b/) || subtitle.match(/\b(19|20)\d{2}\b/);
  const duration = parseLongDuration(secondSubtitle);
  const strapline = textOf(renderer.straplineTextOne).trim();
  const facepileName = textOf(renderer.facepile?.avatarStackViewModel?.text?.content).trim();
  const authorName = strapline || facepileName || undefined;
  const authorId =
    renderer.straplineTextOne?.runs?.find((r: Raw) => r?.navigationEndpoint?.browseEndpoint?.browseId)
      ?.navigationEndpoint?.browseEndpoint?.browseId ||
    renderer.facepile?.avatarStackViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand
      ?.browseEndpoint?.browseId;
  const tokens = menuTokens(renderer);
  return {
    type: expected,
    title,
    subtitle: subtitle || undefined,
    description: description || undefined,
    thumbnail: thumb,
    round: expected === 'artist',
    meta: meta.length ? [...new Set(meta)] : undefined,
    trackCount: trackCountMatch ? Number(trackCountMatch[1]) : undefined,
    year: yearMatch?.[0],
    duration,
    author: authorName ? { name: authorName, id: authorId } : undefined,
    libraryAddToken: tokens.add,
    libraryRemoveToken: tokens.remove,
    subscribe: Boolean(renderer.subscriptionButton || renderer.subscribeButton),
    subscribed: Boolean(
      renderer.subscriptionButton?.subscribeButtonRenderer?.subscribed ||
        renderer.subscribeButton?.subscribeButtonRenderer?.subscribed,
    ),
  };
}

/** Parses "1 hour, 38 minutes" / "4 minutes, 18 seconds" into seconds. */
function parseLongDuration(text: string): number | undefined {
  if (!text) return undefined;
  let total = 0;
  let found = false;
  for (const match of text.matchAll(/(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi)) {
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    found = true;
    if (unit.startsWith('h')) total += value * 3600;
    else if (unit.startsWith('m')) total += value * 60;
    else total += value;
  }
  return found ? total : undefined;
}

function headerRenderersIn(node: Raw, depth = 0): Raw[] {
  if (!node || typeof node !== 'object' || depth > 5) return [];
  const out: Raw[] = [];
  if (node.musicResponsiveHeaderRenderer) out.push(node.musicResponsiveHeaderRenderer);
  if (node.musicDetailHeaderRenderer) out.push(node.musicDetailHeaderRenderer);
  if (node.musicImmersiveHeaderRenderer) out.push(node.musicImmersiveHeaderRenderer);
  if (node.musicVisualHeaderRenderer) out.push(node.musicVisualHeaderRenderer);
  if (node.musicEditablePlaylistDetailHeaderRenderer) {
    const editable = node.musicEditablePlaylistDetailHeaderRenderer;
    out.push(...headerRenderersIn(editable.header, depth + 1));
  }
  if (node.header && depth < 2) out.push(...headerRenderersIn(node.header, depth + 1));
  return out;
}

function headerCandidates(json: Raw): Raw[] {
  const out: Raw[] = [];
  const add = (renderer: Raw) => {
    if (renderer && !out.includes(renderer)) out.push(renderer);
  };
  for (const renderer of headerRenderersIn(json?.header)) add(renderer);
  for (const list of sectionListsOf(json)) {
    for (const node of list.contents || []) {
      for (const renderer of headerRenderersIn(node)) add(renderer);
    }
  }
  if (!out.length) {
    const deep = findDeep(json, (n) => n?.musicResponsiveHeaderRenderer || n?.musicDetailHeaderRenderer);
    if (deep) for (const renderer of headerRenderersIn(deep)) add(renderer);
  }
  return out;
}

export function parseHeader(json: Raw, expected: PageHeader['type']): PageHeader | undefined {
  let found: PageHeader | undefined;
  let chosen: Raw;
  for (const renderer of headerCandidates(json)) {
    const parsed = parseHeaderInternal(renderer, expected);
    if (parsed) {
      found = parsed;
      chosen = renderer;
      break;
    }
  }
  if (found) {
    const editable = findDeep(json?.header, (n) => n?.musicEditablePlaylistDetailHeaderRenderer)
      ?.musicEditablePlaylistDetailHeaderRenderer;
    if (editable) {
      found.browseId = editable?.editHeader?.browseId || found.browseId;
    }
    found.playlistId =
      findDeep(chosen || {}, (n) => n?.watchPlaylistEndpoint?.playlistId)?.watchPlaylistEndpoint?.playlistId ||
      findDeep(json?.header, (n) => n?.watchPlaylistEndpoint?.playlistId)?.watchPlaylistEndpoint?.playlistId;
    if (!found.browseId && expected === 'artist') {
      found.browseId = findDeep(chosen || {}, (n) => n?.browseEndpoint?.browseId)?.browseEndpoint?.browseId;
    }
  }
  return found;
}

export function findDeep(node: Raw, predicate: (value: Raw) => boolean, depth = 0): Raw {
  if (!node || typeof node !== 'object' || depth > 12) return undefined;
  if (predicate(node)) return node;
  for (const child of Object.values(node)) {
    const found = findDeep(child, predicate, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function parseBrowse(json: Raw, expected: PageHeader['type'] = 'generic'): BrowsePage {
  const header = parseHeader(json, expected);
  const { contents, chips, continuation } = collectSectionContents(json);
  const shelves: Shelf[] = [];
  for (const node of contents) {
    if (node.musicCarouselShelfRenderer) {
      const shelf = parseShelf(node.musicCarouselShelfRenderer, 'carousel');
      if (shelf) shelves.push(shelf);
    } else if (node.gridRenderer) {
      const grid = parseGrid(node.gridRenderer);
      if (grid) shelves.push(grid);
    } else if (node.musicShelfRenderer) {
      const shelf = parseShelf(node.musicShelfRenderer, 'list');
      if (shelf) {
        shelf.title = textOf(node.musicShelfRenderer.title).trim() || shelf.title;
        shelves.push(shelf);
      }
    } else if (node.musicPlaylistShelfRenderer) {
      const shelf = parseShelf({ ...node.musicPlaylistShelfRenderer, header: undefined }, 'list');
      if (shelf) shelves.push(shelf);
    } else if (node.musicCardShelfRenderer) {
      const card = parseMusicCardShelf(node.musicCardShelfRenderer);
      if (card) shelves.push({ title: card.title, items: [card], style: 'list' });
    }
  }
  return {
    header,
    shelves,
    chips: parseChips(chips),
    continuation,
  };
}

function parseMusicCardShelf(renderer: Raw): Card | undefined {
  const title = textOf(renderer?.title).trim();
  if (!title) return undefined;
  const nav = renderer?.title?.runs?.[0]?.navigationEndpoint || renderer?.onTap;
  const endpoint = endpointOf(nav);
  const id = endpoint?.browseId || endpoint?.videoId;
  if (!id) return undefined;
  const type = typeFromPageType(navigationPageType(renderer), typeFromId(id, 'song'));
  const subtitle = textOf(renderer?.subtitle).trim();
  const thumbnail = thumbnailsOf(renderer?.thumbnailRenderer || renderer?.thumbnail);
  const parsedSubtitle = parseSubtitleRuns(renderer?.subtitle?.runs || []);
  const videoId = type === 'episode' && id.startsWith('MPED') && id.length === 15 ? id.slice(4) : undefined;
  return {
    type,
    id,
    title,
    subtitle: subtitle || undefined,
    thumbnail,
    round: type === 'artist',
    browseId: id.startsWith('MPED') ? id : undefined,
    track: videoId
      ? {
          id: videoId,
          type: 'episode',
          title,
          artists: parsedSubtitle.artists,
          duration: parsedSubtitle.duration,
          thumbnail,
          source: 'youtube',
        }
      : undefined,
  };
}

export function parseTracksFromBrowse(json: Raw): { tracks: Track[]; continuation?: string } {
  const { contents, continuation } = collectSectionContents(json);
  const tracks: Track[] = [];
  let cont = continuation;
  for (const node of contents) {
    const shelf = node.musicShelfRenderer || node.musicPlaylistShelfRenderer;
    if (!shelf) continue;
    for (const item of shelf.contents || []) {
      if (item?.musicResponsiveListItemRenderer) {
        const track = parseResponsiveItem(item.musicResponsiveListItemRenderer);
        if (track) tracks.push(track);
      } else if (item?.musicMultiRowListItemRenderer) {
        const track = parseMultiRowItem(item.musicMultiRowListItemRenderer);
        if (track) tracks.push(track);
      }
    }
    cont = continuationOf(shelf) || cont;
  }
  // Deduplicate while retaining order.
  const seen = new Set<string>();
  return { tracks: tracks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))), continuation: cont };
}

function responsiveSubtitle(renderer: Raw): string {
  return (renderer?.flexColumns || [])
    .slice(1)
    .map((column: Raw) => textOf(column?.musicResponsiveListItemFlexColumnRenderer?.text).trim())
    .filter(Boolean)
    .join(' • ');
}

function searchCard(renderer: Raw, track: Track, type: Card['type'], subtitle: string): Card {
  const endpoint = endpointOf(firstEndpointNav(renderer));
  const browseId = endpoint?.browseId;
  const label = subtitle.split(' • ')[0]?.trim().toLowerCase() || '';
  let resolved = type;
  if (resolved === 'album' && label.includes('single')) resolved = 'single';
  if (resolved === 'album' && label === 'ep') resolved = 'ep';
  const year = subtitle.match(/\b(19|20)\d{2}\b/)?.[0];
  const trackCount = subtitle.match(/(\d+)\s+(songs?|tracks?|episodes?)/i);
  return {
    type: resolved,
    id: browseId || endpoint?.playlistId || track.id,
    title: track.title,
    subtitle: subtitle || undefined,
    thumbnail: track.thumbnail,
    round: resolved === 'artist' || resolved === 'profile',
    explicit: track.explicit,
    browseId,
    params: endpoint?.params,
    year,
    trackCount: trackCount ? Number(trackCount[1]) : undefined,
    artists: track.artists.filter((artist) => artist.name),
  };
}

function addSearchRenderer(result: SearchResults, renderer: Raw, shelfTitle = ''): void {
  const pageType = navigationPageType(renderer);
  const subtitle = responsiveSubtitle(renderer);
  const label = (subtitle.split(' • ')[0] || shelfTitle).trim().toLowerCase();
  const track = parseResponsiveItem(renderer, label.includes('episode') ? 'episode' : undefined);
  if (!track) return;

  if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' || /^(album|single|ep)\b/.test(label)) {
    result.albums.push(searchCard(renderer, track, 'album', subtitle));
    return;
  }
  if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || /^artist\b/.test(label)) {
    result.artists.push(searchCard(renderer, track, 'artist', subtitle));
    return;
  }
  if (pageType === 'MUSIC_PAGE_TYPE_USER_CHANNEL' || /^profile\b/.test(label)) {
    result.profiles.push(searchCard(renderer, track, 'profile', subtitle));
    return;
  }
  if (pageType === 'MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE' || /^podcast\b/.test(label)) {
    result.podcasts.push(searchCard(renderer, track, 'podcast', subtitle));
    return;
  }
  if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST' || /^playlist\b/.test(label)) {
    result.playlists.push(searchCard(renderer, track, 'playlist', subtitle));
    return;
  }
  if (pageType === 'MUSIC_PAGE_TYPE_PODCAST_EPISODE' || label.includes('episode') || shelfTitle.includes('episode')) {
    result.episodes.push({ ...track, type: 'episode' });
    return;
  }
  if (pageType === 'MUSIC_PAGE_TYPE_VIDEO' || /^video\b/.test(label) || (track.isVideo && !label.includes('song'))) {
    result.videos.push({ ...track, type: 'video', isVideo: true });
    return;
  }
  result.songs.push({ ...track, type: 'song', isVideo: false });
}

export function parseSearch(json: Raw): SearchResults {
  const result: SearchResults = {
    songs: [],
    videos: [],
    albums: [],
    artists: [],
    playlists: [],
    podcasts: [],
    episodes: [],
    profiles: [],
  };
  const sections =
    json?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
      ?.contents ||
    json?.contents?.sectionListRenderer?.contents ||
    [];
  let cont: string | undefined;
  for (const section of sections) {
    if (section?.musicCardShelfRenderer) {
      result.top = parseMusicCardShelf(section.musicCardShelfRenderer) || result.top;
      cont = continuationOf(section.musicCardShelfRenderer) || cont;
      continue;
    }
    if (section?.itemSectionRenderer) {
      for (const child of section.itemSectionRenderer.contents || []) {
        if (child?.musicResponsiveListItemRenderer) {
          addSearchRenderer(result, child.musicResponsiveListItemRenderer);
        }
      }
      cont = continuationOf(section.itemSectionRenderer) || cont;
      continue;
    }
    const shelf = section?.musicShelfRenderer;
    if (!shelf) continue;
    const title = textOf(shelf.title).toLowerCase();
    for (const item of shelf.contents || []) {
      if (item?.musicResponsiveListItemRenderer) {
        addSearchRenderer(result, item.musicResponsiveListItemRenderer, title);
      } else if (item?.musicTwoRowItemRenderer) {
        const card = parseTwoRowItem(item.musicTwoRowItemRenderer);
        if (!card) continue;
        if (card.type === 'album' || card.type === 'single' || card.type === 'ep') result.albums.push(card);
        else if (card.type === 'artist' || card.type === 'profile') result.artists.push(card);
        else if (card.type === 'podcast') result.podcasts.push(card);
        else result.playlists.push(card);
      }
    }
    cont = continuationOf(shelf) || cont;
  }
  result.continuation = cont;
  if (!result.top) {
    result.top = result.songs[0]
      ? { type: 'song', id: result.songs[0].id, title: result.songs[0].title, subtitle: result.songs[0].artists.map((a) => a.name).join(', '), thumbnail: result.songs[0].thumbnail }
      : result.artists[0] || result.albums[0] || result.playlists[0] || result.podcasts[0];
  }
  return result;
}

export function parseNext(json: Raw): NextResult {
  const panel =
    json?.continuationContents?.playlistPanelContinuation ||
    json?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer
      ?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
  const title =
    textOf(
      findDeep(
        json,
        (n) => n?.musicQueueHeaderRenderer,
      )?.musicQueueHeaderRenderer?.title,
    ).trim() || textOf(json?.contents?.musicQueueRenderer?.header?.musicQueueHeaderRenderer?.title).trim();
  const tracks: Track[] = [];
  let currentIndex: number | undefined;
  const items = panel?.contents || [];
  for (const item of items) {
    if (item?.playlistPanelVideoRenderer) {
      const parsed = parsePlaylistPanelItem(item.playlistPanelVideoRenderer);
      if (parsed) {
        if (parsed.selected) currentIndex = tracks.length;
        tracks.push(parsed.track);
      }
    }
  }
  const tabs =
    json?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer
      ?.tabs || [];
  const lyricsEndpoint = endpointOf(tabs[1]?.tabRenderer?.endpoint);
  const relatedEndpoint = endpointOf(tabs[2]?.tabRenderer?.endpoint);
  const endpoint = endpointOf(
    json?.currentVideoEndpoint ||
      findDeep(json, (n) => n?.watchEndpoint?.videoId && n?.watchEndpoint?.playlistId)?.watchEndpoint,
  );
  return {
    title: title || undefined,
    tracks,
    currentIndex,
    lyricsEndpoint,
    relatedEndpoint,
    continuation: continuationOf(panel),
    endpoint,
  };
}

export function parseLyrics(json: Raw): string | null {
  const { contents } = collectSectionContents(json);
  const parts: string[] = [];
  for (const node of contents) {
    if (node.musicDescriptionShelfRenderer) {
      const text = textOf(node.musicDescriptionShelfRenderer.description).trim();
      if (text) parts.push(text);
    }
  }
  if (parts.length) return parts.join('\n\n');
  // Fallback: any description shelf in the tree.
  const shelf = findDeep(json, (n) => n?.musicDescriptionShelfRenderer)?.musicDescriptionShelfRenderer;
  const text = textOf(shelf?.description).trim();
  return text || null;
}

export function parseRelated(json: Raw): BrowsePage {
  return parseBrowse(json, 'generic');
}

export function parseTranscript(json: Raw): string | null {
  const cueGroups =
    json?.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.body
      ?.transcriptBodyRenderer?.cueGroups ||
    findDeep(json, (n) => Array.isArray(n?.cueGroups))?.cueGroups ||
    [];
  const lines: string[] = [];
  const visit = (node: Raw) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;
    if (node.transcriptCueRenderer) {
      const cue = node.transcriptCueRenderer;
      const ms = Number(cue.startOffsetMs || 0);
      const text = String(cue.cue?.simpleText || textOf(cue.cue) || '').replace(/\u200b/g, '').trim();
      if (text) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const millis = ms % 1000;
        lines.push(`[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}]${text}`);
      }
      return;
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(cueGroups);
  return lines.length ? lines.join('\n') : null;
}

export function parseArtistShelves(json: Raw): BrowsePage {
  return parseBrowse(json, 'artist');
}

/** Returns the "songs" list from an album/playlist browse response. */
export function parseDetailPage(json: Raw, type: 'album' | 'playlist' | 'podcast'): BrowsePage {
  const page = parseBrowse(json, type);
  const header = page.header;
  if (header) {
    header.playlistId =
      header.playlistId ||
      findDeep(json, (n) => n?.watchPlaylistEndpoint?.playlistId)?.watchPlaylistEndpoint?.playlistId;
    const tokens = findDeep(json, (n) => n?.musicResponsiveHeaderRenderer)?.musicResponsiveHeaderRenderer;
    if (tokens?.menu?.menuRenderer) {
      // tokens are also available from individual rows; nothing else needed here.
    }
    if (header.thumbnail) {
      for (const shelf of page.shelves) {
        for (const item of shelf.items) {
          if (item.track && !item.track.thumbnail) item.track.thumbnail = header.thumbnail;
          if (!item.thumbnail) item.thumbnail = header.thumbnail;
        }
      }
    }
  }
  return page;
}

/** A helper used for tests and debugging: strips volatile keys before comparing. */
export function summarize(json: Raw) {
  return {
    header: parseHeader(json, 'generic')?.title,
    shelves: parseBrowse(json).shelves.map((s) => ({ title: s.title, count: s.items.length, style: s.style })),
  };
}

/** Continuation responses use `continuationContents` instead of `contents`. */
export function parseBrowseContinuation(json: Raw): BrowsePage {
  const sectionList =
    json?.continuationContents?.sectionListContinuation ||
    json?.continuationContents?.gridContinuation ||
    json?.continuationContents?.musicShelfContinuation;
  if (!sectionList) return { shelves: [] };
  const shelves: Shelf[] = [];
  const contents = sectionList?.contents || sectionList?.items || [];
  for (const node of contents) {
    if (node?.musicCarouselShelfRenderer) {
      const shelf = parseShelf(node.musicCarouselShelfRenderer, 'carousel');
      if (shelf) shelves.push(shelf);
    } else if (node?.musicTwoRowItemRenderer) {
      const card = parseTwoRowItem(node.musicTwoRowItemRenderer);
      if (card) {
        if (shelves.length) shelves[0].items.push(card);
        else shelves.push({ items: [card], style: 'grid' });
      }
    } else if (node?.musicShelfRenderer) {
      const shelf = parseShelf(node.musicShelfRenderer, 'list');
      if (shelf) shelves.push(shelf);
    } else if (node?.musicResponsiveListItemRenderer) {
      const track = parseResponsiveItem(node.musicResponsiveListItemRenderer);
      if (track) {
        const items = [{ type: track.type, id: track.id, title: track.title, subtitle: track.artists.map((a) => a.name).join(', '), thumbnail: track.thumbnail, track } as Card];
        if (shelves.length) shelves[0].items.push(...items);
        else shelves.push({ items, style: 'list' });
      }
    }
  }
  return {
    shelves,
    continuation: continuationOf(sectionList),
    chips: parseChips(
      sectionList?.header?.chipCloudRenderer?.chips || json?.continuationContents?.sectionListContinuation?.header?.chipCloudRenderer?.chips || [],
    ),
  };
}

export function parseSearchContinuation(json: Raw): SearchResults {
  const continuation = json?.continuationContents?.sectionListContinuation;
  const shelf =
    json?.continuationContents?.musicShelfContinuation ||
    continuation?.contents?.find((n: Raw) => n?.musicShelfRenderer)?.musicShelfRenderer;
  const results: SearchResults = {
    songs: [],
    videos: [],
    albums: [],
    artists: [],
    playlists: [],
    podcasts: [],
    episodes: [],
    profiles: [],
  };
  const title = textOf(shelf?.title).toLowerCase();
  for (const item of shelf?.contents || []) {
    if (item?.musicResponsiveListItemRenderer) {
      addSearchRenderer(results, item.musicResponsiveListItemRenderer, title);
    }
  }
  for (const section of continuation?.contents || []) {
    if (section?.itemSectionRenderer) {
      for (const item of section.itemSectionRenderer.contents || []) {
        if (item?.musicResponsiveListItemRenderer) {
          addSearchRenderer(results, item.musicResponsiveListItemRenderer);
        }
      }
    }
  }
  results.continuation = continuationOf(shelf);
  if (!results.continuation) {
    results.continuation = continuationOf(continuation);
  }
  return results;
}

export function parseDetailContinuation(json: Raw): { tracks: Track[]; continuation?: string } {
  const shelf =
    json?.continuationContents?.musicPlaylistShelfContinuation ||
    json?.continuationContents?.musicShelfContinuation ||
    json?.continuationContents?.sectionListContinuation?.contents?.find(
      (n: Raw) => n?.musicPlaylistShelfRenderer || n?.musicShelfRenderer,
    );
  const target = shelf?.musicPlaylistShelfRenderer || shelf?.musicShelfRenderer || shelf;
  const tracks: Track[] = [];
  for (const item of target?.contents || []) {
    if (item?.musicResponsiveListItemRenderer) {
      const track = parseResponsiveItem(item.musicResponsiveListItemRenderer);
      if (track) tracks.push(track);
    } else if (item?.musicMultiRowListItemRenderer) {
      const track = parseMultiRowItem(item.musicMultiRowListItemRenderer);
      if (track) tracks.push(track);
    }
  }
  return { tracks, continuation: continuationOf(target) };
}
