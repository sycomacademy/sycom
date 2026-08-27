import { Loader as BaseLoader } from "@sycom/ui/components/loader";

import { FadeIn } from "@/components/layout/motion-fade";

export default function Loader({ text = "Loading" }: { text?: string } = {}) {
  return (
    <FadeIn className="size-full">
      <BaseLoader mode="container" spinnerClassName="text-primary" text={text} />
    </FadeIn>
  );
}

export function RootLoader({ text = "Loading workspace" }: { text?: string } = {}) {
  return (
    <FadeIn className="size-full" durationMs={320}>
      <BaseLoader mode="screen" spinnerClassName="text-primary" text={text} />
    </FadeIn>
  );
}
