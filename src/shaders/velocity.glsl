// GLSL Fragment shader: velocity integration (leapfrog)
// Texture layout N bodies stored as texels in an TEX_SIZE x TEX_SIZE grid
// texturePosition: vec4(px, py, pz, mass)
// textureVelocity: vec4(vx, vy, vz, 0)

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform float uG;
uniform float uC2;
uniform float uSoftening;
uniform float uDt;
uniform float uNumBodies;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 posData = texture2D( texturePosition, uv );
    vec4 velData = texture2D( textureVelocity, uv );

    vec3 pos  = posData.xyz;
    float myMass = posData.w;
    vec3 vel  = velData.xyz;

    // Inactive slot — pass through
    if ( myMass <= 0.0 ) {
        gl_FragColor = velData;
        return;
    }

    vec3 accel = vec3( 0.0 );

    // Determine which texel index corresponds to this body
    float myIdx = floor( gl_FragCoord.y ) * resolution.x + floor( gl_FragCoord.x );

    // Iterate over all body slots (unrolled-style with constant upper bound)
    for ( int i = 0; i < 64; i++ ) {
        float fi = float( i );
        if ( fi >= uNumBodies ) break;

        // Compute UV for body i
        float bx = mod( fi, resolution.x );
        float by = floor( fi / resolution.x );
        vec2 bodyUV = ( vec2( bx, by ) + 0.5 ) / resolution.xy;

        vec4 other = texture2D( texturePosition, bodyUV );
        float otherMass = other.w;
        if ( otherMass <= 0.0 ) continue;

        // Skip self (same texel index)
        float otherIdx = by * resolution.x + bx;
        if ( abs( otherIdx - myIdx ) < 0.5 ) continue;

        vec3 r = other.xyz - pos;
        float dist2 = dot( r, r ) + uSoftening * uSoftening;
        float dist  = sqrt( dist2 );

        // Newtonian gravity magnitude
        float grav = uG * otherMass / dist2;

        // Post-Newtonian Schwarzschild correction (capped to avoid blow-up)
        float pn = 1.0 + ( 3.0 * uG * otherMass ) / ( dist * uC2 );
        pn = min( pn, 8.0 );

        accel += ( grav * pn / dist ) * r;
    }

    // Leapfrog velocity update
    vec3 newVel = vel + accel * uDt;

    // Cap at 0.9c (relativistic speed limit)
    float speed = length( newVel );
    float cLight = sqrt( uC2 );
    if ( speed > 0.9 * cLight ) {
        newVel = newVel * ( 0.9 * cLight / speed );
    }

    gl_FragColor = vec4( newVel, 0.0 );
}
