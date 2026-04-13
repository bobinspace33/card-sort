/**
 * Per-category pastel styling (sort UI, swipe edges, sorted gallery).
 * Index with `categoryPastelAt(activity.categories.indexOf(name))`.
 */
export type CategoryPastel = {
  border: string;
  borderOver: string;
  panelBg: string;
  panelBgOver: string;
  /** Tailwind text color for category titles */
  titleClass: string;
  /** Swipe zone tint (same hue family) */
  swipeTint: string;
};

const PALETTE: CategoryPastel[] = [
  {
    border: 'rgb(100, 168, 138)',
    borderOver: 'rgb(5, 150, 105)',
    panelBg: 'rgba(186, 232, 212, 0.26)',
    panelBgOver: 'rgba(167, 243, 208, 0.4)',
    titleClass: 'text-emerald-900',
    swipeTint: 'rgb(186 232 212)',
  },
  {
    border: 'rgb(214, 140, 125)',
    borderOver: 'rgb(225, 95, 115)',
    panelBg: 'rgba(255, 201, 184, 0.26)',
    panelBgOver: 'rgba(255, 180, 165, 0.42)',
    titleClass: 'text-rose-950',
    swipeTint: 'rgb(255 201 184)',
  },
  {
    border: 'rgb(140, 125, 200)',
    borderOver: 'rgb(109, 40, 217)',
    panelBg: 'rgba(221, 212, 255, 0.26)',
    panelBgOver: 'rgba(196, 181, 253, 0.4)',
    titleClass: 'text-violet-950',
    swipeTint: 'rgb(221 212 255)',
  },
  {
    border: 'rgb(200, 165, 75)',
    borderOver: 'rgb(180, 130, 20)',
    panelBg: 'rgba(255, 241, 191, 0.28)',
    panelBgOver: 'rgba(253, 224, 71, 0.38)',
    titleClass: 'text-amber-950',
    swipeTint: 'rgb(255 241 191)',
  },
  {
    border: 'rgb(90, 160, 205)',
    borderOver: 'rgb(14, 165, 233)',
    panelBg: 'rgba(191, 231, 255, 0.26)',
    panelBgOver: 'rgba(125, 211, 252, 0.38)',
    titleClass: 'text-sky-950',
    swipeTint: 'rgb(191 231 255)',
  },
  {
    border: 'rgb(210, 130, 170)',
    borderOver: 'rgb(219, 39, 119)',
    panelBg: 'rgba(255, 214, 231, 0.26)',
    panelBgOver: 'rgba(251, 182, 206, 0.4)',
    titleClass: 'text-pink-950',
    swipeTint: 'rgb(255 214 231)',
  },
  {
    border: 'rgb(120, 175, 95)',
    borderOver: 'rgb(74, 155, 50)',
    panelBg: 'rgba(220, 252, 200, 0.28)',
    panelBgOver: 'rgba(190, 242, 150, 0.42)',
    titleClass: 'text-lime-950',
    swipeTint: 'rgb(220 252 200)',
  },
  {
    border: 'rgb(215, 140, 115)',
    borderOver: 'rgb(234, 88, 12)',
    panelBg: 'rgba(255, 218, 210, 0.26)',
    panelBgOver: 'rgba(254, 202, 165, 0.4)',
    titleClass: 'text-orange-950',
    swipeTint: 'rgb(255 218 210)',
  },
  {
    border: 'rgb(125, 135, 200)',
    borderOver: 'rgb(79, 70, 229)',
    panelBg: 'rgba(210, 220, 255, 0.26)',
    panelBgOver: 'rgba(165, 180, 252, 0.38)',
    titleClass: 'text-indigo-950',
    swipeTint: 'rgb(210 220 255)',
  },
  {
    border: 'rgb(95, 165, 155)',
    borderOver: 'rgb(13, 148, 136)',
    panelBg: 'rgba(175, 230, 220, 0.26)',
    panelBgOver: 'rgba(153, 246, 228, 0.38)',
    titleClass: 'text-teal-950',
    swipeTint: 'rgb(175 230 220)',
  },
];

export function categoryPastelAt(index: number): CategoryPastel {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]!;
}
