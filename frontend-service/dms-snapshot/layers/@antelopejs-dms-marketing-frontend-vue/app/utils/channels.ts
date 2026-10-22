/** Icon and bar colour of each acquisition channel, in one place. */
export interface ChannelStyle {
  icon: string
  bar: string
}

const NEUTRAL_STYLE: ChannelStyle = {
  icon: 'i-ph-question',
  bar: 'bg-(--ui-border-accented)',
}

// A categorical palette: six hues told apart in both themes, none of them the
// green and orange that mean "good" and "watch out" elsewhere in the module.
const CHANNEL_STYLES: Record<string, ChannelStyle> = {
  direct: { icon: 'i-ph-arrow-elbow-down-right', bar: 'bg-primary' },
  organic: {
    icon: 'i-ph-magnifying-glass',
    bar: 'bg-blue-600 dark:bg-blue-400',
  },
  email: {
    icon: 'i-ph-envelope-simple',
    bar: 'bg-violet-600 dark:bg-violet-400',
  },
  referral: { icon: 'i-ph-link', bar: 'bg-amber-500 dark:bg-amber-300' },
  social: {
    icon: 'i-ph-share-network',
    bar: 'bg-pink-600 dark:bg-pink-400',
  },
  paid: {
    icon: 'i-ph-currency-eur',
    bar: 'bg-slate-700 dark:bg-slate-300',
  },
}

export function channelStyle(channel: string): ChannelStyle {
  return CHANNEL_STYLES[channel] ?? NEUTRAL_STYLE
}
