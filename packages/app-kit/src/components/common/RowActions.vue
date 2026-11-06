<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@edutrack/ui/components/dropdown-menu';
import { cn } from '@edutrack/ui/lib/utils';
import { EllipsisVerticalIcon } from '@lucide/vue';
import type { Component } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

export interface RowAction {
  label: string;
  icon?: Component;
  /** Navigates when chosen. */
  to?: RouteLocationRaw;
  /** Runs when chosen (open a drawer, ask for confirmation, …). */
  onSelect?: () => void;
  /** Styles the item as destructive and separates it from the safe actions above. */
  destructive?: boolean;
}

defineProps<{ actions: RowAction[]; label: string }>();

// Run after the menu has closed and restored focus, so a dialog opened by the action isn't
// fighting the menu's focus trap (which can leave the page unclickable).
const run = (action: RowAction) => action.onSelect && setTimeout(action.onSelect, 0);
</script>

<template>
  <DropdownMenu v-if="actions.length">
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-label="`Actions for ${label}`"
        class="text-muted-foreground data-[state=open]:bg-muted"
      >
        <EllipsisVerticalIcon />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-48">
      <template v-for="(action, i) in actions" :key="action.label">
        <DropdownMenuSeparator v-if="action.destructive && i > 0 && !actions[i - 1]?.destructive" />
        <DropdownMenuItem
          :as-child="!!action.to"
          :class="
            cn(
              'gap-2.5 text-[13px]',
              action.destructive && 'text-destructive focus:bg-error-subtle focus:text-destructive',
            )
          "
          @select="run(action)"
        >
          <RouterLink v-if="action.to" :to="action.to">
            <component :is="action.icon" v-if="action.icon" class="text-muted-foreground" />{{
              action.label
            }}
          </RouterLink>
          <template v-else>
            <component
              :is="action.icon"
              v-if="action.icon"
              :class="action.destructive ? 'text-destructive' : 'text-muted-foreground'"
            />{{ action.label }}
          </template>
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
