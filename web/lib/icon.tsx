import {
  IconAlertOctagonFilled,
  IconAlertTriangleFilled,
  IconAperture,
  IconArchiveFilled,
  IconBookFilled,
  IconBoxMultipleFilled,
  IconCaretUpDownFilled,
  IconCheckFilled,
  IconChevronDownFilled,
  IconChevronRightFilled,
  IconCircleArrowDownFilled,
  IconCircleCheckFilled,
  IconCircleChevronUpFilled,
  IconClockFilled,
  IconCopyFilled,
  IconCornerDownLeft,
  IconCurrentLocationFilled,
  IconDeviceDesktopFilled,
  IconDotsFilled,
  IconDotsVerticalFilled,
  IconDownloadFilled,
  IconFileMusicFilled,
  IconFileScissorsFilled,
  IconFileTextFilled,
  IconFileTypographyFilled,
  IconFileUploadFilled,
  IconFolderFilled,
  IconFolderOpenFilled,
  IconInfoCircleFilled,
  IconLayoutGridFilled,
  IconLayoutSidebarFilled,
  IconLayoutSidebarLeftCollapseFilled,
  IconLayoutSidebarRightCollapseFilled,
  IconLinkFilled,
  IconLoader2,
  IconMaximize,
  IconMessage2Filled,
  IconMessageChatbotFilled,
  IconMessageCircleFilled,
  IconMinimize,
  IconMinus,
  IconMoonFilled,
  IconMusicOff,
  IconPaletteFilled,
  IconPencilFilled,
  IconPhotoFilled,
  IconPictureInPictureFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
  IconPlugConnected,
  IconPlusFilled,
  IconRefresh,
  IconSearchFilled,
  IconSettingsFilled,
  IconSparklesFilled,
  IconSubtitles,
  IconSunFilled,
  IconTrashFilled,
  IconVectorSpline,
  IconVideoFilled,
  IconVolume,
  IconVolumeOff,
  IconXFilled,
  IconZoomInFilled,
  IconZoomScanFilled,
  IconLoader as TablerIconLoader,
} from "@tabler/icons-react";
import type { ComponentPropsWithoutRef, ComponentType } from "react";
import { AppleIcon } from "@/components/ui/svgs/appleIcon";
import { GithubIcon } from "@/components/ui/svgs/githubIcon";
import { cn } from "@/lib/utils";

type SvgIcon = ComponentType<ComponentPropsWithoutRef<"svg">>;

const MUTED_ICON_CLASS = "opacity-55";

const muteIcon = (Icon: SvgIcon): SvgIcon => {
  const MutedIcon = ({
    className,
    ...props
  }: ComponentPropsWithoutRef<"svg">) => (
    <Icon {...props} className={cn(MUTED_ICON_CLASS, className)} />
  );
  return MutedIcon;
};

export const APP_ICON_CLASS = `size-4 shrink-0 ${MUTED_ICON_CLASS}`;

export const IconAlertOctagon = muteIcon(IconAlertOctagonFilled);
export const IconAlertTriangle = muteIcon(IconAlertTriangleFilled);
export const IconArrowDown = muteIcon(IconCircleArrowDownFilled);
export const IconCheck = muteIcon(IconCheckFilled);
export const IconChevronDown = muteIcon(IconChevronDownFilled);
export const IconChevronRight = muteIcon(IconChevronRightFilled);
export const IconChevronUp = muteIcon(IconCircleChevronUpFilled);
export const IconCircleCheck = muteIcon(IconCircleCheckFilled);
export const IconInfoCircle = muteIcon(IconInfoCircleFilled);
export const IconLayoutSidebar = muteIcon(IconLayoutSidebarFilled);
export const IconLoader = TablerIconLoader;
export const IconSearch = muteIcon(IconSearchFilled);
export const IconSelector = muteIcon(IconCaretUpDownFilled);
export const IconX = muteIcon(IconXFilled);

export const Aperture = muteIcon(IconAperture);
export const Archive = muteIcon(IconArchiveFilled);
export const ArrowDownIcon = muteIcon(IconCircleArrowDownFilled);
export const Book = muteIcon(IconBookFilled);
export const Bot = muteIcon(IconMessageChatbotFilled);
export const Box = muteIcon(IconBoxMultipleFilled);
/** Brand marks for marketing CTAs: keep full opacity (not muted UI chrome). */
export const BrandApple = AppleIcon;
export const BrandGithub = GithubIcon;
export const Captions = muteIcon(IconSubtitles);
export const Check = muteIcon(IconCheckFilled);
export const CheckIcon = muteIcon(IconCheckFilled);
export const ChevronDownIcon = muteIcon(IconChevronDownFilled);
export const ChevronRight = muteIcon(IconChevronRightFilled);
export const ChevronRightIcon = muteIcon(IconChevronRightFilled);
export const ChevronUpIcon = muteIcon(IconCircleChevronUpFilled);
export const ChevronsUpDown = muteIcon(IconCaretUpDownFilled);
export const Clock3 = muteIcon(IconClockFilled);
export const Copy = muteIcon(IconCopyFilled);
export const CornerDownLeftIcon = muteIcon(IconCornerDownLeft);
export const Download = muteIcon(IconDownloadFilled);
export const DownloadIcon = muteIcon(IconDownloadFilled);
export const FileTextIcon = muteIcon(IconFileTextFilled);
export const Film = muteIcon(IconVideoFilled);
export const FolderClosed = muteIcon(IconFolderFilled);
export const FolderOpen = muteIcon(IconFolderOpenFilled);
export const GripVertical = muteIcon(IconDotsVerticalFilled);
export const ImageIcon = muteIcon(IconPhotoFilled);
export const LayoutTemplate = muteIcon(IconLayoutGridFilled);
export const Link2 = muteIcon(IconLinkFilled);
export const Loader2Icon = IconLoader2;
export const Locate = muteIcon(IconCurrentLocationFilled);
export const Maximize = muteIcon(IconMaximize);
export const MessageSquare = muteIcon(IconMessageCircleFilled);
export const MessageSquarePlus = muteIcon(IconMessage2Filled);
export const Minimize = muteIcon(IconMinimize);
export const Minus = muteIcon(IconMinus);
export const Monitor = muteIcon(IconDeviceDesktopFilled);
export const Moon = muteIcon(IconMoonFilled);
export const MoreHorizontal = muteIcon(IconDotsFilled);
export const Music = muteIcon(IconFileMusicFilled);
export const MusicOff = muteIcon(IconMusicOff);
export const NewChatIcon = muteIcon(IconMessage2Filled);
export const Palette = muteIcon(IconPaletteFilled);
export const PanelLeft = muteIcon(IconLayoutSidebarLeftCollapseFilled);
export const PanelRight = muteIcon(IconLayoutSidebarRightCollapseFilled);
export const Pause = muteIcon(IconPlayerPauseFilled);
export const Pencil = muteIcon(IconPencilFilled);
export const PictureInPicture2 = muteIcon(IconPictureInPictureFilled);
export const Play = muteIcon(IconPlayerPlayFilled);
export const PlugConnected = muteIcon(IconPlugConnected);
export const Plus = muteIcon(IconPlusFilled);
export const PlusIcon = muteIcon(IconPlusFilled);
export const RotateCcw = muteIcon(IconRefresh);
export const Scan = muteIcon(IconZoomScanFilled);
export const ScanSearch = muteIcon(IconZoomScanFilled);
export const Scissors = muteIcon(IconFileScissorsFilled);
export const Search = muteIcon(IconSearchFilled);
export const SearchIcon = muteIcon(IconSearchFilled);
export const Settings2 = muteIcon(IconSettingsFilled);
export const SettingsIcon = muteIcon(IconSettingsFilled);
export const Sparkles = muteIcon(IconSparklesFilled);
export const Spline = muteIcon(IconVectorSpline);
export const SquareIcon = muteIcon(IconPlayerStopFilled);
export const Sun = muteIcon(IconSunFilled);
export const Trash2 = muteIcon(IconTrashFilled);
export const Type = muteIcon(IconFileTypographyFilled);
export const Upload = muteIcon(IconFileUploadFilled);
export const Video = muteIcon(IconVideoFilled);
export const Volume2 = muteIcon(IconVolume);
export const VolumeX = muteIcon(IconVolumeOff);
export const X = muteIcon(IconXFilled);
export const XIcon = muteIcon(IconXFilled);
export const ZoomIn = muteIcon(IconZoomInFilled);
