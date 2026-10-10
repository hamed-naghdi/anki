import { Component, computed, inject, input } from '@angular/core';
import { GripVertical } from '@primeicons/angular/grip-vertical';
import { Plus } from '@primeicons/angular/plus';
import { Times } from '@primeicons/angular/times';
import { TreeDragDropService, type TreeNode } from 'primeng/api';
import { ButtonDirective } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { Tree } from 'primeng/tree';
import type { TreeNodeDropEvent } from 'primeng/types/tree';
import {
  fieldText,
  sourcePath,
  type CardField,
  type LayoutGroup,
  type RichTextField,
} from '../../../card/card-field';
import { fromTreeNodes, groupLabel, isValidDrop, toTreeNodes } from '../card-layout';
import { CardEditorStore, type CardSide } from '../card-editor.store';

/** One side's card as a drag-and-drop list of the groups and fields it's arranged in. */
@Component({
  selector: 'app-layout-panel',
  imports: [Tree, ButtonDirective, Textarea, GripVertical, Plus, Times],
  templateUrl: './layout-panel.html',
  // p-tree's draggableNodes/droppableNodes silently do nothing without a TreeDragDropService in
  // scope - PrimeNG injects it as optional, but drag-and-drop can't work without it.
  providers: [TreeDragDropService],
  // PrimeNG's .p-tree-node-label keeps its flex-item default (flex: 0 1 auto), so a node template's
  // w-full only fills that shrink-wrapped box, not the row - which squeezes the rich-text
  // textareas. It's rendered by p-tree's own template, so it's only reachable via ::ng-deep.
  styles: `
    :host ::ng-deep .p-tree-node-label {
      flex: 1 1 auto;
      min-width: 0;
    }
  `,
  // The middle column (xl). The host stretches to the row's full height so its divider runs the
  // whole way down; the content inside (layout-panel.html) sticks to the top of the viewport, so the
  // items stay in view while the results grow, scrolling on its own if taller than the screen. The
  // padding is on the host, like the other two columns', so flex-1 gives all three the same width.
  host: {
    class:
      'min-w-0 border-t border-surface-200 p-4 xl:flex-1 xl:border-t-0 xl:border-r dark:border-surface-700',
  },
})
export class LayoutPanel {
  readonly side = input.required<CardSide>();

  protected readonly store = inject(CardEditorStore);
  protected readonly state = computed(() => this.store.sides[this.side()]);

  /**
   * The layout as p-tree nodes - a throwaway view rebuilt from the layout on every change. A drop
   * is the one place p-tree rearranges these nodes itself (see onDrop).
   */
  protected readonly nodes = computed(() =>
    toTreeNodes(this.state().layout(), this.state().expandedGroups()),
  );

  protected groupLabel(group: LayoutGroup): string {
    return groupLabel(group, this.state().layout().indexOf(group));
  }

  protected fieldLabel(field: CardField): string {
    return field.kind === 'richText' ? 'Custom text' : sourcePath(field);
  }

  protected readonly fieldText = fieldText;
  protected readonly grip = 'size-3.5 shrink-0 cursor-grab text-(--p-text-muted-color)';
  protected readonly iconButton =
    'shrink-0 rounded p-1 text-(--p-text-muted-color) hover:bg-black/10 dark:hover:bg-white/20';

  // With [validateDrop], p-tree only rearranges its nodes once `accept()` is called - so vet the
  // drop against the layout's rules first, let p-tree apply it (it alone knows whether a "between"
  // drop landed before or after its target), then read the new arrangement back.
  protected onDrop({ dragNode, dropNode, dropPoint, accept }: TreeNodeDropEvent): void {
    if (!dragNode?.key || !dropNode?.key || !dropPoint || !accept) {
      return;
    }
    const drop = { dragKey: dragNode.key, targetKey: dropNode.key, point: dropPoint };
    if (isValidDrop(this.state().layout(), drop)) {
      accept();
      this.state().layout.set(fromTreeNodes(this.nodes()));
    }
  }

  protected setExpanded(node: TreeNode | undefined, expanded: boolean): void {
    const key = node?.key;
    if (key) {
      this.state().expandedGroups.update((keys) => {
        const next = new Set(keys);
        if (expanded) next.add(key);
        else next.delete(key);
        return next;
      });
    }
  }

  protected editRichText(field: RichTextField, event: Event): void {
    field.html.set((event.target as HTMLTextAreaElement).value);
  }
}
