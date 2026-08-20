import { Defs, LinearGradient, Polygon, Stop, Svg } from "@react-pdf/renderer";

import { certificateArtworkColors as c } from "./theme";

const WIDTH = 380;
const HEIGHT = 330;

/**
 * Overlapping translucent facets anchored to the top-right corner. Drawn as
 * vectors rather than a bitmap so the certificate needs no network fetch and
 * stays crisp at print resolution.
 */
export function CornerArtwork() {
  return (
    <Svg
      height={HEIGHT}
      style={{ position: "absolute", top: 0, right: 0 }}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
    >
      <Defs>
        <LinearGradient id="facetSweep" x1="1" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={c.violet} stopOpacity="0.62" />
          <Stop offset="1" stopColor={c.navy} stopOpacity="0.04" />
        </LinearGradient>
      </Defs>

      <Polygon fill="url(#facetSweep)" points="380,0 168,0 380,302" />
      <Polygon fill={c.teal} fillOpacity="0.2" points="380,68 380,288 204,0 144,0" />
      <Polygon fill={c.navy} fillOpacity="0.24" points="380,188 380,318 274,0 238,0" />
      <Polygon fill={c.indigo} fillOpacity="0.34" points="380,0 254,0 380,174" />
      <Polygon fill={c.violet} fillOpacity="0.46" points="380,0 310,0 380,98" />
      <Polygon fill={c.navy} fillOpacity="0.62" points="380,0 352,0 380,36" />
    </Svg>
  );
}
