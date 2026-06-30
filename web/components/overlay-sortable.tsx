"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { applyDragReorder } from "@/lib/dnd-reorder";
import { GripVertical } from "@/lib/icon";
import { cn } from "@/lib/utils";

export interface SortableRow {
  id: string;
  label: string;
}

function Row({
  id,
  label,
  active,
  onSelect,
}: {
  id: string;
  label: string;
  active: boolean;
  onSelect?: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1.5 text-xs",
        active && "ring-1 ring-foreground/25",
        isDragging && "opacity-60"
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Button
        aria-label={`Drag ${label} to reorder`}
        className="cursor-grab touch-none rounded-sm text-muted-foreground active:cursor-grabbing"
        size="icon-sm"
        type="button"
        variant="ghost"
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </Button>
      <Button
        className="h-auto min-w-0 flex-1 justify-start truncate rounded-sm px-1 py-0 text-left"
        onClick={() => onSelect?.(id)}
        type="button"
        variant="ghost"
      >
        {label}
      </Button>
    </div>
  );
}

// A vertical drag-to-reorder list (dnd-kit). Emits the new id order on drop;
// the caller applies it to the EDL and saves. Keyboard-accessible.
export function OverlaySortable({
  rows,
  onReorder,
  selectedId,
  onSelect,
}: {
  rows: SortableRow[];
  onReorder: (orderedIds: string[]) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      onReorder(
        applyDragReorder(
          rows.map((r) => r.id),
          String(active.id),
          String(over.id)
        )
      );
    }
  };
  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      sensors={sensors}
    >
      <SortableContext
        items={rows.map((r) => r.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-1">
          {rows.map((r) => (
            <Row
              active={r.id === selectedId}
              id={r.id}
              key={r.id}
              label={r.label}
              onSelect={onSelect}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
