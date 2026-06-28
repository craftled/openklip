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
import { GripVertical } from "lucide-react";
import { applyDragReorder } from "@/lib/dnd-reorder";
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
      <button
        aria-label={`Drag ${label} to reorder`}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        className="min-w-0 flex-1 cursor-pointer truncate text-left"
        onClick={() => onSelect?.(id)}
        type="button"
      >
        {label}
      </button>
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
