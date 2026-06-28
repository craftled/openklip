import type { IconProps } from "@phosphor-icons/react";
import {
  Aperture as PhAperture,
  Archive as PhArchive,
  ArrowBendDownLeft as PhArrowBendDownLeft,
  ArrowCounterClockwise as PhArrowCounterClockwise,
  ArrowDown as PhArrowDown,
  ArrowsIn as PhArrowsIn,
  ArrowsOut as PhArrowsOut,
  BezierCurve as PhBezierCurve,
  CaretDown as PhCaretDown,
  CaretRight as PhCaretRight,
  CaretUp as PhCaretUp,
  CaretUpDown as PhCaretUpDown,
  ChatCentered as PhChatCentered,
  ChatCenteredText as PhChatCenteredText,
  Check as PhCheck,
  CircleNotch as PhCircleNotch,
  Clock as PhClock,
  Copy as PhCopy,
  DotsSixVertical as PhDotsSixVertical,
  DotsThree as PhDotsThree,
  Download as PhDownload,
  FilmStrip as PhFilmStrip,
  FolderOpen as PhFolderOpen,
  GearSix as PhGearSix,
  Image as PhImage,
  MagnifyingGlass as PhMagnifyingGlass,
  MagnifyingGlassPlus as PhMagnifyingGlassPlus,
  Monitor as PhMonitor,
  Moon as PhMoon,
  MusicNote as PhMusicNote,
  Package as PhPackage,
  Palette as PhPalette,
  Pause as PhPause,
  PencilSimple as PhPencilSimple,
  PictureInPicture as PhPictureInPicture,
  Play as PhPlay,
  Plus as PhPlus,
  Robot as PhRobot,
  Scan as PhScan,
  Scissors as PhScissors,
  SidebarSimple as PhSidebarSimple,
  Sparkle as PhSparkle,
  SpeakerHigh as PhSpeakerHigh,
  SpeakerSlash as PhSpeakerSlash,
  SquaresFour as PhSquaresFour,
  Stop as PhStop,
  Subtitles as PhSubtitles,
  Sun as PhSun,
  TextT as PhTextT,
  Trash as PhTrash,
  Upload as PhUpload,
  VideoCamera as PhVideoCamera,
  X as PhX,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";

type PhosphorIcon = ComponentType<IconProps>;

function fillIcon(
  PhosphorComponent: PhosphorIcon,
  defaults?: Partial<IconProps>
): PhosphorIcon {
  const UiIcon = ({ weight = "fill", ...props }: IconProps) => (
    <PhosphorComponent
      data-ui-icon=""
      {...defaults}
      weight={weight}
      {...props}
    />
  );
  UiIcon.displayName = PhosphorComponent.displayName;
  return UiIcon as PhosphorIcon;
}

export const Aperture = fillIcon(PhAperture);
export const Archive = fillIcon(PhArchive);
export const ArrowDownIcon = fillIcon(PhArrowDown);
export const Bot = fillIcon(PhRobot);
export const Box = fillIcon(PhPackage);
export const Captions = fillIcon(PhSubtitles);
export const Check = fillIcon(PhCheck);
export const CheckIcon = fillIcon(PhCheck);
export const ChevronDownIcon = fillIcon(PhCaretDown);
export const ChevronRight = fillIcon(PhCaretRight);
export const ChevronRightIcon = fillIcon(PhCaretRight);
export const ChevronUpIcon = fillIcon(PhCaretUp);
export const ChevronsUpDown = fillIcon(PhCaretUpDown);
export const Clock3 = fillIcon(PhClock);
export const Copy = fillIcon(PhCopy);
export const CornerDownLeftIcon = fillIcon(PhArrowBendDownLeft);
export const Download = fillIcon(PhDownload);
export const DownloadIcon = fillIcon(PhDownload);
export const Film = fillIcon(PhFilmStrip);
export const FolderOpen = fillIcon(PhFolderOpen);
export const GripVertical = fillIcon(PhDotsSixVertical);
export const ImageIcon = fillIcon(PhImage);
export const LayoutTemplate = fillIcon(PhSquaresFour);
export const Loader2Icon = fillIcon(PhCircleNotch);
export const Maximize = fillIcon(PhArrowsOut);
export const Minimize = fillIcon(PhArrowsIn);
export const Monitor = fillIcon(PhMonitor);
export const Moon = fillIcon(PhMoon);
export const MoreHorizontal = fillIcon(PhDotsThree);
export const MessageSquare = fillIcon(PhChatCentered);
export const MessageSquarePlus = fillIcon(PhChatCenteredText);
export const Music = fillIcon(PhMusicNote);
export const Palette = fillIcon(PhPalette);
export const PanelLeft = fillIcon(PhSidebarSimple);
export const PanelRight = fillIcon(PhSidebarSimple, { mirrored: true });
export const Pause = fillIcon(PhPause);
export const Pencil = fillIcon(PhPencilSimple);
export const PictureInPicture2 = fillIcon(PhPictureInPicture);
export const Play = fillIcon(PhPlay);
export const Plus = fillIcon(PhPlus);
export const PlusIcon = fillIcon(PhPlus);
export const RotateCcw = fillIcon(PhArrowCounterClockwise);
export const Scan = fillIcon(PhScan);
export const ScanSearch = fillIcon(PhScan);
export const Scissors = fillIcon(PhScissors);
export const Search = fillIcon(PhMagnifyingGlass);
export const SearchIcon = fillIcon(PhMagnifyingGlass);
export const Settings2 = fillIcon(PhGearSix);
export const Sparkles = fillIcon(PhSparkle);
export const Spline = fillIcon(PhBezierCurve);
export const SquareIcon = fillIcon(PhStop);
export const Sun = fillIcon(PhSun);
export const Trash2 = fillIcon(PhTrash);
export const Type = fillIcon(PhTextT);
export const Upload = fillIcon(PhUpload);
export const Video = fillIcon(PhVideoCamera);
export const Volume2 = fillIcon(PhSpeakerHigh);
export const VolumeX = fillIcon(PhSpeakerSlash);
export const X = fillIcon(PhX);
export const XIcon = fillIcon(PhX);
export const ZoomIn = fillIcon(PhMagnifyingGlassPlus);
