import type { Card, Shelf } from '@shared/types';

function isVideoCard(card: Card): boolean {
  return card.type === 'video' || Boolean(card.track?.isVideo) || card.track?.type === 'video';
}

/** Drop YouTube Music video shelves and video cards from browse pages. */
export function withoutVideos(shelves: Shelf[]): Shelf[] {
  return shelves
    .filter((shelf) => !/(^|\b)videos?(\b|$)/i.test(shelf.title || ''))
    .map((shelf) => ({
      ...shelf,
      items: shelf.items.filter((card) => !isVideoCard(card)),
    }))
    .filter((shelf) => shelf.items.length > 0);
}
