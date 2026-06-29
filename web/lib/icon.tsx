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
  Check as PhCheck,
  CircleNotch as PhCircleNotch,
  Clock as PhClock,
  Copy as PhCopy,
  DotsSixVertical as PhDotsSixVertical,
  DotsThree as PhDotsThree,
  Download as PhDownload,
  FilmStrip as PhFilmStrip,
  Image as PhImage,
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
import type { ComponentType, SVGProps } from "react";

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
/** Closed folder (Synara central-icons-reversed: folder-2). */
function FolderClosedIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-ui-icon=""
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M9.13202 3.75H4.75C3.64543 3.75 2.75 4.64543 2.75 5.75V17.25C2.75 18.3546 3.64543 19.25 4.75 19.25H19.25C20.3546 19.25 21.25 18.3546 21.25 17.25V7.75C21.25 6.64543 20.3546 5.75 19.25 5.75H12.8124C12.2915 5.75 11.7911 5.54674 11.4177 5.18345L10.5267 4.31655C10.1534 3.95326 9.65297 3.75 9.13202 3.75Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <path
        d="M2.75 12.75V11.75C2.75 10.6454 3.64543 9.75 4.75 9.75H19.25C20.3546 9.75 21.25 10.6454 21.25 11.75V12.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}
FolderClosedIcon.displayName = "FolderClosedIcon";

/** Open folder (Synara central-icons-reversed: folder-open-front). */
function FolderOpenFrontIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-ui-icon=""
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M2.75 9V5.75C2.75 4.64543 3.64543 3.75 4.75 3.75H9.13202C9.65297 3.75 10.1534 3.95326 10.5267 4.31655L11.4177 5.18345C11.7911 5.54674 12.2915 5.75 12.8124 5.75H19.25C20.3546 5.75 21.25 6.64543 21.25 7.75V9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <path
        d="M3.52041 11.75C2.23223 11.75 1.28001 12.95 1.57273 14.2045L2.38943 17.7045C2.60064 18.6096 3.40762 19.25 4.33711 19.25H19.663C20.5925 19.25 21.3995 18.6096 21.6107 17.7044L22.4273 14.2044C22.72 12.95 21.7678 11.75 20.4796 11.75H3.52041Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}
FolderOpenFrontIcon.displayName = "FolderOpenFrontIcon";

export const FolderClosed = FolderClosedIcon;
export const FolderOpen = FolderOpenFrontIcon;
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

/** New chat row (Synara central-icons-reversed: compose-pencil). */
function ComposePencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-ui-icon=""
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M10.938 4.5H9.9c-1.136 0-1.929 0-2.546.05-.605.05-.953.143-1.216.277-.564.288-1.023.747-1.31 1.31-.135.264-.228.612-.277 1.218C4.5 7.97 4.5 8.765 4.5 9.9v4.2c0 1.136 0 1.929.05 2.546.05.605.143.953.277 1.216.288.565.747 1.023 1.31 1.31.264.135.612.228 1.217.277.617.05 1.41.051 2.546.051h4.2c1.136 0 1.929 0 2.545-.05.606-.05.954-.143 1.217-.277.565-.288 1.023-.746 1.31-1.31.135-.264.228-.612.277-1.217.05-.617.051-1.41.051-2.546v-1.037h2V14.1c0 1.103.001 1.992-.058 2.709-.06.728-.185 1.368-.487 1.96-.48.941-1.245 1.707-2.185 2.186-.593.302-1.233.428-1.961.488-.718.058-1.606.057-2.71.057H9.9c-1.103 0-1.991.001-2.709-.058-.728-.06-1.368-.185-1.96-.487-.941-.48-1.707-1.245-2.186-2.185-.302-.593-.428-1.233-.487-1.961-.059-.718-.058-1.606-.058-2.71V9.9c0-1.103-.001-1.991.058-2.709.06-.728.185-1.368.487-1.96.48-.941 1.245-1.707 2.185-2.186.593-.302 1.233-.428 1.961-.487.718-.059 1.606-.058 2.71-.058h1.037v2z" />
      <path
        clipRule="evenodd"
        d="M16.293 3.293c1.219-1.219 3.195-1.219 4.414 0 1.219 1.219 1.219 3.195 0 4.414l-5.491 5.491c-.533.533-.896.896-1.31 1.179-.356.24-.742.433-1.148.574-.478.167-.983.234-1.729.341l-2.708.387.387-2.708c.107-.746.174-1.25.34-1.729.142-.405.335-.792.575-1.148.283-.42.646-.777 1.179-1.31l5.491-5.491zm3 1.414c-.438-.438-1.148-.438-1.586 0l-5.491 5.491c-.587.587-.784.79-.934 1.013-.144.214-.26.445-.345.688-.088.254-.131.533-.248 1.354l-.01.067.068-.008c.82-.118 1.1-.161 1.354-.25.243-.084.474-.2.688-.344.223-.15.426-.347 1.013-.934l5.491-5.491c.438-.438.438-1.148 0-1.586z"
        fillRule="evenodd"
      />
    </svg>
  );
}
ComposePencilIcon.displayName = "ComposePencilIcon";

export const MessageSquarePlus = ComposePencilIcon;
export const NewChatIcon = ComposePencilIcon;
export const Music = fillIcon(PhMusicNote);
export const Palette = fillIcon(PhPalette);
/** Left sidebar hide toggle (Synara central-icons-reversed: sidebar-hidden-left-wide). */
function SidebarHiddenLeftWideIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-ui-icon=""
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M2.75 6.75C2.75 5.64543 3.64543 4.75 4.75 4.75H19.25C20.3546 4.75 21.25 5.64543 21.25 6.75V17.25C21.25 18.3546 20.3546 19.25 19.25 19.25H4.75C3.64543 19.25 2.75 18.3546 2.75 17.25V6.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <path
        d="M6.25 8.25V15.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}
SidebarHiddenLeftWideIcon.displayName = "SidebarHiddenLeftWideIcon";

export const PanelLeft = SidebarHiddenLeftWideIcon;

/** Right sidebar hide toggle (Synara central-icons-reversed: sidebar-hidden-right-wide). */
function SidebarHiddenRightWideIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-ui-icon=""
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M2.75 6.75C2.75 5.64543 3.64543 4.75 4.75 4.75H19.25C20.3546 4.75 21.25 5.64543 21.25 6.75V17.25C21.25 18.3546 20.3546 19.25 19.25 19.25H4.75C3.64543 19.25 2.75 18.3546 2.75 17.25V6.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <path
        d="M17.75 8.25V15.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}
SidebarHiddenRightWideIcon.displayName = "SidebarHiddenRightWideIcon";

export const PanelRight = SidebarHiddenRightWideIcon;
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

/** Search (Synara central-icons-reversed: magnifying-glass). */
function MagnifyingGlassIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-ui-icon=""
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M20.25 20.25L16.1265 16.1265M16.1265 16.1265C17.4385 14.8145 18.25 13.002 18.25 11C18.25 6.99594 15.0041 3.75 11 3.75C6.99594 3.75 3.75 6.99594 3.75 11C3.75 15.0041 6.99594 18.25 11 18.25C13.002 18.25 14.8145 17.4385 16.1265 16.1265Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}
MagnifyingGlassIcon.displayName = "MagnifyingGlassIcon";

export const Search = MagnifyingGlassIcon;
export const SearchIcon = MagnifyingGlassIcon;

/** Sidebar settings row (Synara: Tabler IconSettings). */
function SettingsIconGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-ui-icon=""
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <path
        d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}
SettingsIconGlyph.displayName = "SettingsIconGlyph";

export const SettingsIcon = SettingsIconGlyph;
export const Settings2 = SettingsIconGlyph;
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
