export const VERT_SRC = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uUVScale;
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUV;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorldPos = w.xyz;
  vNormal = mat3(uModel) * aNormal;
  vUV = aUV * uUVScale;
  gl_Position = uProj * uView * w;
}`;

// Shared shadow declarations, injected into every lit fragment shader so
// one code path serves the legacy, instanced, PBR and terrain programs.
// uEnableShadows == 0 short-circuits to fully lit (and the renderer skips
// binding the sampler), so the cost when off is one uniform branch.
export const SHADOW_UNIFORMS_GLSL = `uniform highp sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform vec2 uShadowTexelUV;
uniform float uShadowTexel;
uniform float uShadowBias;
uniform float uShadowNormalBias;
uniform float uShadowStrength;
uniform int uEnableShadows;`;

// shadowFactor(worldPos, N, L) -> 1 lit, uShadowStrength dark when in shadow.
// Mirrors shadowDepthBias/normalOffsetWorld in shadowmap.ts. Hardware PCF
// (COMPARE_REF_TO_TEXTURE + LEQUAL) does 2x2 bilinear taps per sample; the
// 3x3 loop is a 9-tap filter. Outside the map the surface is lit.
export const SHADOW_RECEIVER_GLSL = `float shadowFactor(vec3 worldPos, vec3 N, vec3 L) {
  if (uEnableShadows == 0) return 1.0;
  float ndl = max(dot(N, L), 0.0);
  // Normal offset first: slide the lookup along the surface by a texel's
  // worth, scaled by grazing angle. Removes acne without peter-panning.
  vec3 pos = worldPos + N * (uShadowTexel * uShadowNormalBias * (1.0 - ndl));
  vec4 lp = uShadowMatrix * vec4(pos, 1.0);
  vec3 proj = lp.xyz / lp.w;
  proj = proj * 0.5 + 0.5;
  if (proj.z > 1.0 || proj.z < 0.0) return 1.0;
  if (any(lessThan(proj.xy, vec2(0.0))) || any(greaterThan(proj.xy, vec2(1.0)))) return 1.0;
  float ref = proj.z - (uShadowBias + (1.0 - ndl) * uShadowTexel * 0.6);
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      sum += texture(uShadowMap, vec3(proj.xy + vec2(float(x), float(y)) * uShadowTexelUV, ref));
    }
  }
  float s = sum / 9.0;
  // Fade out at the map border so the cascade edge is invisible.
  vec2 fade = smoothstep(vec2(0.0), vec2(0.06), proj.xy) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - proj.xy);
  s = mix(1.0, s, fade.x * fade.y);
  return mix(1.0, s, uShadowStrength);
}`;

export const FRAG_SRC = `#version 300 es
precision mediump float;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUV;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uLightIntensity;
uniform vec3 uCamPos;
uniform float uShininess;
uniform sampler2D uMap;
uniform int uUseTexture;
uniform int uPointCount;
uniform vec3 uPointPos[4];
uniform vec3 uPointColor[4];
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
out vec4 outColor;
${SHADOW_UNIFORMS_GLSL}
${SHADOW_RECEIVER_GLSL}
void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize(-uLightDir);
  float shade = shadowFactor(vWorldPos, n, l);
  float diff = max(dot(n, l), 0.0) * uLightIntensity * shade;
  vec3 viewDir = normalize(uCamPos - vWorldPos);
  vec3 h = normalize(l + viewDir);
  float spec = pow(max(dot(n, h), 0.0), uShininess) * 0.3 * shade;
  vec3 ambient = vec3(0.25);
  vec3 albedo = uColor;
  if (uUseTexture == 1) {
    albedo *= texture(uMap, vUV).rgb;
  }
  vec3 col = albedo * (ambient + diff * 0.9);
  // point lights (diffuse only, distance attenuated)
  for (int i = 0; i < 4; i++) {
    if (i >= uPointCount) break;
    vec3 toL = uPointPos[i] - vWorldPos;
    float d = length(toL);
    float att = 1.0 / (1.0 + 0.25 * d * d);
    float pd = max(dot(n, normalize(toL)), 0.0) * att;
    col += albedo * uPointColor[i] * pd;
  }
  col += vec3(spec);
  float fd = length(vWorldPos - uCamPos);
  float f = smoothstep(uFogNear, uFogFar, fd);
  col = mix(col, uFogColor, f);
  outColor = vec4(col, 1.0);
}`;

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error("Shader compile failed: " + gl.getShaderInfoLog(s));
  }
  return s;
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("Program link failed: " + gl.getProgramInfoLog(p));
  }
  return p;
}// Instanced variant: same lighting/fog as FRAG_SRC, but model matrix, color
// and (uvScale, shininess) arrive per instance. Kept as a separate pair (not
// a #define maze) so the proven single-draw path is byte-for-byte untouched.
export const INST_VERT_SRC = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in mat4 aIModel;
layout(location=7) in vec3 aIColor;
layout(location=8) in vec2 aIParams;
uniform mat4 uView;
uniform mat4 uProj;
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUV;
out vec3 vColor;
out float vShininess;
void main() {
  vec4 w = aIModel * vec4(aPos, 1.0);
  vWorldPos = w.xyz;
  vNormal = mat3(aIModel) * aNormal;
  vUV = aUV * aIParams.x;
  vColor = aIColor;
  vShininess = aIParams.y;
  gl_Position = uProj * uView * w;
}`;

export const INST_FRAG_SRC = `#version 300 es
precision mediump float;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUV;
in vec3 vColor;
in float vShininess;
uniform vec3 uLightDir;
uniform float uLightIntensity;
uniform vec3 uCamPos;
uniform sampler2D uMap;
uniform int uUseTexture;
uniform int uPointCount;
uniform vec3 uPointPos[4];
uniform vec3 uPointColor[4];
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
out vec4 outColor;
${SHADOW_UNIFORMS_GLSL}
${SHADOW_RECEIVER_GLSL}
void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize(-uLightDir);
  float shade = shadowFactor(vWorldPos, n, l);
  float diff = max(dot(n, l), 0.0) * uLightIntensity * shade;
  vec3 viewDir = normalize(uCamPos - vWorldPos);
  vec3 h = normalize(l + viewDir);
  float spec = pow(max(dot(n, h), 0.0), vShininess) * 0.3 * shade;
  vec3 ambient = vec3(0.25);
  vec3 albedo = vColor;
  if (uUseTexture == 1) {
    albedo *= texture(uMap, vUV).rgb;
  }
  vec3 col = albedo * (ambient + diff * 0.9);
  for (int i = 0; i < 4; i++) {
    if (i >= uPointCount) break;
    vec3 toL = uPointPos[i] - vWorldPos;
    float d = length(toL);
    float att = 1.0 / (1.0 + 0.25 * d * d);
    float pd = max(dot(n, normalize(toL)), 0.0) * att;
    col += albedo * uPointColor[i] * pd;
  }
  col += vec3(spec);
  float fd = length(vWorldPos - uCamPos);
  float f = smoothstep(uFogNear, uFogFar, fd);
  col = mix(col, uFogColor, f);
  outColor = vec4(col, 1.0);
}`;

// PBR direct-lighting fragment (Cook-Torrance GGX + Schlick + Smith).
// Equations mirror evalPBR() in pbr.ts, except direct light is multiplied
// by PI so intensity 1.0 matches the legacy path's brightness. No IBL/env
// maps yet: metals pick up the analytic sky-gradient ambient instead.
// Shares VERT_SRC (vNormal/vWorldPos/vUV varyings).
export const PBR_FRAG_SRC = `#version 300 es
precision mediump float;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUV;
uniform vec3 uAlbedo;
uniform float uMetallic;
uniform float uRoughness;
uniform sampler2D uAlbedoMap;
uniform sampler2D uMetalRoughMap;
uniform sampler2D uNormalMap;
uniform sampler2D uAOMap;
uniform sampler2D uEmissiveMap;
uniform int uUseAlbedoMap;
uniform int uUseMetalRough;
uniform int uUseNormalMap;
uniform int uUseAO;
uniform int uUseEmissiveMap;
uniform float uNormalScale;
uniform float uAOStrength;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;
uniform float uOpacity;
uniform int uAlphaMode;
uniform float uAlphaCutoff;
uniform vec3 uLightDir;
uniform float uLightIntensity;
uniform vec3 uCamPos;
uniform int uPointCount;
uniform vec3 uPointPos[4];
uniform vec3 uPointColor[4];
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform float uAmbientStrength;
out vec4 outColor;
${SHADOW_UNIFORMS_GLSL}
${SHADOW_RECEIVER_GLSL}

vec3 perturbNormal(vec3 N, vec3 V) {
  vec3 q0 = dFdx(vWorldPos);
  vec3 q1 = dFdy(vWorldPos);
  vec2 st0 = dFdx(vUV);
  vec2 st1 = dFdy(vUV);
  vec3 S = normalize(q0 * st1.t - q1 * st0.t + vec3(1e-6));
  vec3 T = normalize(-q0 * st1.s + q1 * st0.s + vec3(1e-6));
  vec3 mapN = texture(uNormalMap, vUV).rgb * 2.0 - 1.0;
  return normalize(S * mapN.x * uNormalScale + T * mapN.y * uNormalScale + N * mapN.z);
}

vec3 brdf(vec3 albedo, float metallic, float roughness, vec3 N, vec3 V, vec3 L, vec3 lightColor) {
  vec3 H = normalize(V + L);
  float NdotL = max(dot(N, L), 0.0);
  if (NdotL <= 0.0) return vec3(0.0);
  float NdotV = max(dot(N, V), 0.0);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);
  float a = roughness * roughness;
  float a2 = a * a;
  float denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159265 * denom * denom + 1e-7);
  vec3 F0 = mix(vec3(0.04), albedo, metallic);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);
  float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  float G = (NdotL / (NdotL * (1.0 - k) + k + 1e-4)) * (NdotV / (NdotV * (1.0 - k) + k + 1e-4));
  vec3 kd = (1.0 - F) * (1.0 - metallic);
  vec3 diff = kd * albedo / 3.14159265;
  vec3 spec = (D * F * G) / max(4.0 * NdotV * NdotL, 1e-4);
  return (diff + spec) * lightColor * NdotL * 3.14159265;
}

void main() {
  vec3 albedo = uAlbedo;
  float alpha = uOpacity;
  if (uUseAlbedoMap == 1) {
    vec4 t = texture(uAlbedoMap, vUV);
    albedo *= t.rgb;
    alpha *= t.a;
  }
  if (uAlphaMode == 1 && alpha < uAlphaCutoff) discard;
  float metallic = uMetallic;
  float roughness = uRoughness;
  if (uUseMetalRough == 1) {
    vec4 mr = texture(uMetalRoughMap, vUV);
    metallic = mr.b;
    roughness = mr.g;
  }
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 N = normalize(vNormal);
  if (uUseNormalMap == 1) N = perturbNormal(N, V);
  float ao = 1.0;
  if (uUseAO == 1) ao = mix(1.0, texture(uAOMap, vUV).r, uAOStrength);
  vec3 skyAmb = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
  vec3 ambient = skyAmb * albedo * ao * uAmbientStrength;
  vec3 Lo = brdf(albedo, metallic, roughness, N, V, normalize(-uLightDir), vec3(1.0) * uLightIntensity)
          * shadowFactor(vWorldPos, N, normalize(-uLightDir));
  for (int i = 0; i < 4; i++) {
    if (i >= uPointCount) break;
    vec3 toL = uPointPos[i] - vWorldPos;
    float d = length(toL);
    float att = 1.0 / (1.0 + 0.25 * d * d);
    Lo += brdf(albedo, metallic, roughness, N, V, normalize(toL), uPointColor[i] * att);
  }
  vec3 emission = uEmissive * uEmissiveIntensity;
  if (uUseEmissiveMap == 1) emission *= texture(uEmissiveMap, vUV).rgb;
  vec3 col = ambient + Lo + emission;
  float fd = length(vWorldPos - uCamPos);
  float f = smoothstep(uFogNear, uFogFar, fd);
  col = mix(col, uFogColor, f);
  outColor = vec4(col, alpha);
}`;

// Terrain fragment: splat-mapped matte surfacing (no specular — earth doesn't
// shine). Shares VERT_SRC varyings. Detail textures tile by vUV; the splat
// mask is sampled unscaled (0..1 across the patch).
export const TERRAIN_FRAG_SRC = `#version 300 es
precision mediump float;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUV;
uniform sampler2D uSplatMap;
uniform sampler2D uDetailA;
uniform sampler2D uDetailB;
uniform sampler2D uDetailC;
uniform float uDetailTiling;
uniform vec3 uLightDir;
uniform float uLightIntensity;
uniform vec3 uCamPos;
uniform int uPointCount;
uniform vec3 uPointPos[4];
uniform vec3 uPointColor[4];
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
out vec4 outColor;
${SHADOW_UNIFORMS_GLSL}
${SHADOW_RECEIVER_GLSL}
void main() {
  vec3 n = normalize(vNormal);
  vec3 weights = texture(uSplatMap, vUV).rgb;
  float wsum = weights.r + weights.g + weights.b + 1e-4;
  weights /= wsum;
  vec3 albedo =
    texture(uDetailA, vUV * uDetailTiling).rgb * weights.r +
    texture(uDetailB, vUV * uDetailTiling).rgb * weights.g +
    texture(uDetailC, vUV * uDetailTiling).rgb * weights.b;
  vec3 l = normalize(-uLightDir);
  float diff = max(dot(n, l), 0.0) * uLightIntensity * shadowFactor(vWorldPos, n, l);
  vec3 ambient = vec3(0.3);
  vec3 col = albedo * (ambient + diff * 0.9);
  for (int i = 0; i < 4; i++) {
    if (i >= uPointCount) break;
    vec3 toL = uPointPos[i] - vWorldPos;
    float d = length(toL);
    float att = 1.0 / (1.0 + 0.25 * d * d);
    float pd = max(dot(n, normalize(toL)), 0.0) * att;
    col += albedo * uPointColor[i] * pd;
  }
  float fd = length(vWorldPos - uCamPos);
  float f = smoothstep(uFogNear, uFogFar, fd);
  col = mix(col, uFogColor, f);
  outColor = vec4(col, 1.0);
}`;

// --- shadow depth pass (v2.16) ---
// Depth-only programs. The vertex stage is shared with the lit passes;
// the fragment stage writes nothing (depth-only FBO). Front faces are
// culled during the depth pass, which is what makes a single depth
// compare enough to avoid acne on closed box geometry.
export const SHADOW_FRAG_SRC = `#version 300 es
precision mediump float;
void main() { }`;

// Fullscreen composite: single grade + vignette pass over the captured
// scene texture. Mirrors gradePixel + vignetteFactor in post.ts.
export const POST_VERT_SRC = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
export const POST_FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uScene;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uVignette;
out vec4 outColor;
void main() {
  vec3 col = texture(uScene, vUV).rgb;
  col *= exp2(uExposure);
  col = (col - 0.5) * uContrast + 0.5;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = vec3(luma) + (col - vec3(luma)) * uSaturation;
  vec2 c = vUV * 2.0 - 1.0;
  float d = length(c) / 1.41421356;
  col *= clamp(1.0 - uVignette * d * d, 0.0, 1.0);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
