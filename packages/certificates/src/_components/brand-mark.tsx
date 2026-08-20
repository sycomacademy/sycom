import { Image, View } from "@react-pdf/renderer";

import { BRAND } from "@sycom/ui/image/assets";
import { buildImageUrl } from "@sycom/ui/image/cdn";

const logoSrc = buildImageUrl(BRAND.LOGO_PNG);

export function BrandMark({ width = 68 }: { width?: number }) {
  return (
    <View style={{ alignItems: "flex-start" }}>
      <Image src={logoSrc} style={{ width, height: width * 0.78, objectFit: "contain" }} />
    </View>
  );
}
