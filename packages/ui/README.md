# @edutrack/ui

The EduTrack design system: [shadcn-vue](https://www.shadcn-vue.com/) components (Reka UI + Tailwind CSS v4), theme tokens and the shared stylesheet. Every portal consumes it from source; there is no build step.

## Use in a portal

```css
/* src/assets/main.css */
@import 'tailwindcss';
@import '@edutrack/ui/styles.css';
```

```vue
<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { cn } from '@edutrack/ui/lib/utils';
</script>
```

## Add a component

Run from the repo root. Components are written to `src/components/<name>/`:

```bash
npm run ui:add -w @edutrack/ui -- dialog
```

Theme tokens live in `src/styles.css`. Change them there and every portal picks them up.
