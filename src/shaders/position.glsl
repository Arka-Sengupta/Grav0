// GLSL Fragment shader: position integration (leapfrog)
// texturePosition: vec4(px, py, pz, mass)
// textureVelocity: vec4(vx, vy, vz, pad)

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform float uDt;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 posData = texture2D(texturePosition, uv);
    vec4 velData = texture2D(textureVelocity, uv);

    vec3 pos = posData.xyz;
    float mass = posData.w;
    vec3 vel = velData.xyz;

    // Skip inactive bodies
    if (mass <= 0.0) {
        gl_FragColor = posData;
        return;
    }

    // Leapfrog position full step: x_{n+1} = x_n + v_{n+1/2} * dt
    vec3 newPos = pos + vel * uDt;

    gl_FragColor = vec4(newPos, mass);
}
