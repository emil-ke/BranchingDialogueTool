<script lang="ts">
    import { useSvelteFlow } from "@xyflow/svelte";

    const { zoomIn, zoomOut } = useSvelteFlow();

    function onKeyDown(event: KeyboardEvent) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        const target = event.target as HTMLElement;
        const isEditing =
            target &&
            (target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable);
        if (isEditing) return;

        if (event.key === "+" || (event.key === "=" && event.shiftKey)) {
            event.preventDefault();
            void zoomIn({ duration: 100 });
        } else if (event.key === "-") {
            event.preventDefault();
            void zoomOut({ duration: 100 });
        }
    }
</script>

<svelte:window onkeydown={onKeyDown} />
