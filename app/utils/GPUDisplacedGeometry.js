/**
 * Created by siroko on 7/11/16.
 */

var THREE = require('three');

var BaseGLPass = require('./BaseGLPass');

var vs_bufferGeometryMobile   = require('../glsl/vs-buffer-geometry-mobile.glsl');
var fs_bufferGeometryMobile   = require('../glsl/fs-buffer-geometry-mobile.glsl');
var vs_bufferGeometry   = require('../glsl/vs-buffer-geometry.glsl');
var vs_depthBufferGeometry = require('../glsl/vs-depth-buffer-geometry.glsl');
var fs_bufferGeometry   = require('../glsl/fs-buffer-geometry.glsl');
var vs_simpleQuad       = require('../glsl/vs-simple-quad.glsl');
var fs_updatePositions  = require('../glsl/fs-update-positions-geometry.glsl');
var fs_updateSpring     = require('../glsl/fs-update-positions-spring.glsl');

var GPUDisplacedGeometry = function( params ) {

    BaseGLPass.call( this, params );

    this.geom = params.geom;
    this.pingpong = 0;

    if( this.geom.faces ) {

        var totalGeomVertices = this.geom.faces.length * 3;

    } else {

        var totalGeomVertices = this.geom.attributes.position.array.length / 3;

    }

    this.lights             = params.lights;

    this.isMobile           = params.isMobile;

    var sqrtTotalGeom       = Math.sqrt( totalGeomVertices );
    // Aproximatino to the nearest upper power of two number
    var totalPOT            = Math.pow( 2, Math.ceil( Math.log( sqrtTotalGeom ) / Math.log( 2 ) ) );

    this.sizeW = totalPOT;
    this.sizeH = totalPOT;

    this.total              = this.sizeW * this.sizeH;

    this.finalPositionsRT   = this.getRenderTarget( this.sizeW, this.sizeH );
    this.springRT           = this.getRenderTarget( this.sizeW, this.sizeH );

    this.data = new Float32Array( this.total * 4 );
    this.normalsData = new Float32Array( this.total * 4 );

    if( this.geom.faces ) {

        var v;
        var n;
        var vertices = this.geom.vertices;
        for (var i = 0; i < this.geom.faces.length; i++) {

            var face = this.geom.faces[i];

            n = face.vertexNormals;

            this.normalsData[i * 12]      = n[0].x;
            this.normalsData[i * 12 + 1]  = n[0].y;
            this.normalsData[i * 12 + 2]  = n[0].z;
            this.normalsData[i * 12 + 3]  = 1;

            v = vertices[face.a];
            this.data[i * 12]       = v.x;
            this.data[i * 12 + 1]   = v.y;
            this.data[i * 12 + 2]   = v.z;
            this.data[i * 12 + 3]   = 1;

            this.normalsData[i * 12 + 4]  = n[1].x;
            this.normalsData[i * 12 + 5]  = n[1].y;
            this.normalsData[i * 12 + 6]  = n[1].z;
            this.normalsData[i * 12 + 7]  = 1;

            v = vertices[face.b];
            this.data[i * 12 + 4]   = v.x;
            this.data[i * 12 + 5]   = v.y;
            this.data[i * 12 + 6]   = v.z;
            this.data[i * 12 + 7]   = 1;

            this.normalsData[i * 12 + 8]  = n[2].x;
            this.normalsData[i * 12 + 9]  = n[2].y;
            this.normalsData[i * 12 + 10] = n[2].z;
            this.normalsData[i * 12 + 11] = 1;

            v = vertices[face.c];
            this.data[i * 12 + 8]   = v.x;
            this.data[i * 12 + 9]   = v.y;
            this.data[i * 12 + 10]  = v.z;
            this.data[i * 12 + 11]  = 1;
        }

    } else {
        var it = 0;
        for (var i = 0; i < this.geom.attributes.position.array.length; i++) {

            var position = this.geom.attributes.position.array[ i ];
            this.data[ it ] = position;

            var normal = this.geom.attributes.normal.array[ i ];
            this.normalsData[ it ] = normal;

            if( ( i + 1 ) % 3 == 0 && i != 0 ) {
                it++;
                this.data[ it ]     = 1;
                this.normalsData[ it ] = 1;
            }
            it ++;

        }
    }

    this.geometryRT = new THREE.DataTexture( this.data, this.sizeW, this.sizeH, THREE.RGBAFormat, THREE.FloatType);
    this.geometryRT.minFilter = THREE.NearestFilter;
    this.geometryRT.magFilter = THREE.NearestFilter;
    this.geometryRT.needsUpdate = true;

    this.normalsRT = new THREE.DataTexture( this.normalsData, this.sizeW, this.sizeH, THREE.RGBAFormat, THREE.FloatType);
    this.normalsRT.minFilter = THREE.NearestFilter;
    this.normalsRT.magFilter = THREE.NearestFilter;
    this.normalsRT.needsUpdate = true;

    this.index2D            = new THREE.BufferAttribute( new Float32Array( this.total * 2 ), 2 );
    this.positions          = new THREE.BufferAttribute( new Float32Array( this.total * 3 ), 3 );

    var div = 1 / this.sizeW;
    var uv = new THREE.Vector2(0, 0);
    for (var i = 0; i < this.total; i++) {

        uv.x = ( i % this.sizeW ) / this.sizeW;
        if ( i % this.sizeW == 0 && i != 0) uv.y += div;
        this.index2D.setXY( i, uv.x, uv.y );
        if( this.geom.faces ) {
            this.positions.setXYZ(i, this.data[i * 4], this.data[i * 4 + 1], this.data[i * 4 + 2] );
        } else {
            if( this.geom.attributes.position.array[ i * 3 ] ) {
                this.positions.setXYZ( i, this.geom.attributes.position.array[i * 3], this.geom.attributes.position.array[i * 3 + 1], this.geom.attributes.position.array[i * 3 + 2] );
            } else {
                this.positions.setXYZ( i, 0, 0, 0 );
            }
        }
    }

    console.log( this.total, this.sizeW);

    this.bufferGeometry = new THREE.BufferGeometry();
    this.bufferGeometry.addAttribute( 'aV2I', this.index2D );
    this.bufferGeometry.addAttribute( 'position', this.positions );

    if( this.lights ) {

        if( !this.isMobile ) {
            this.bufferMaterial = new THREE.ShadowMaterial();
            this.bufferMaterial.lights = true;
            this.bufferMaterial.extensions.derivatives = true;
            this.bufferMaterial.uniforms["opacity"] = {value: 1.0};
            this.bufferMaterial.uniforms["uLights"] = {type: 'f', value: 1};
            this.bufferMaterial.uniforms["uPositionsTexture"] = {type: 't', value: this.geometryRT};
            this.bufferMaterial.uniforms["uNormalsTexture"] = {type: 't', value: this.normalsRT};
            this.bufferMaterial.uniforms["normalMap"] = params.uniforms.normalMap;
            this.bufferMaterial.uniforms["textureMap"] = params.uniforms.textureMap;
            this.bufferMaterial.uniforms["pointLightPosition"] = {
                type: 'v3v',
                value: [this.lights[0].position, this.lights[1].position]
            };
            this.bufferMaterial.uniforms["pointLightColor"] = {
                type: 'v3v',
                value: [this.lights[0].color, this.lights[1].color]
            };
            this.bufferMaterial.uniforms["pointLightIntensity"] = {
                type: 'fv',
                value: [this.lights[0].intensity, this.lights[1].intensity]
            };
            this.bufferMaterial.vertexShader = vs_bufferGeometry;
            this.bufferMaterial.fragmentShader = fs_bufferGeometry;
        } else {
            this.bufferMaterial = new THREE.RawShaderMaterial();
            this.bufferMaterial.uniforms["opacity"] = {value: 1.0};
            this.bufferMaterial.uniforms["uLights"] = {type: 'f', value: 1};
            this.bufferMaterial.uniforms["uPositionsTexture"] = {type: 't', value: this.geometryRT};
            this.bufferMaterial.uniforms["uNormalsTexture"] = {type: 't', value: this.normalsRT};
            this.bufferMaterial.uniforms["normalMap"] = params.uniforms.normalMap;
            this.bufferMaterial.uniforms["textureMap"] = params.uniforms.textureMap;
            this.bufferMaterial.uniforms["pointLightPosition"] = {
                type: 'v3v',
                value: [this.lights[0].position, this.lights[1].position]
            };
            this.bufferMaterial.uniforms["pointLightColor"] = {
                type: 'v3v',
                value: [this.lights[0].color, this.lights[1].color]
            };
            this.bufferMaterial.uniforms["pointLightIntensity"] = {
                type: 'fv',
                value: [this.lights[0].intensity, this.lights[1].intensity]
            };
            this.bufferMaterial.vertexShader = vs_bufferGeometryMobile;
            this.bufferMaterial.fragmentShader = fs_bufferGeometryMobile;
        }

    } else {

        this.bufferMaterial = new THREE.RawShaderMaterial({
            'uniforms': {
                "uLights": { type: 'f', value: 0 },
                "uPositionsTexture": {type: 't', value: this.geometryRT},
                "normalMap": params.uniforms.normalMap,
                "textureMap": params.uniforms.textureMap
            },

            vertexShader: vs_bufferGeometry,
            fragmentShader: fs_bufferGeometry

        });
    }

    this.mesh = new THREE.Mesh( this.bufferGeometry, this.bufferMaterial );
    // magic here
    this.mesh.customDepthMaterial = new THREE.ShaderMaterial( {

        defines: {
            'USE_SHADOWMAP': '',
            'DEPTH_PACKING': '3201'
        },
        vertexShader: vs_depthBufferGeometry,
        fragmentShader: THREE.ShaderLib.depth.fragmentShader,

        uniforms: this.bufferMaterial.uniforms
    } );

    this.updateSpringMaterial = new THREE.RawShaderMaterial( {
        'uniforms': {
            'uBasePositions'        : { type: 't', value: this.geometryRT },
            'uPrevPositions'        : { type: 't', value: this.geometryRT },
            'uPrevPositionsGeom'    : { type: 't', value: this.geometryRT },
            'uTime'                 : { type: 'f', value: 1 },
            'uTouch'                : params.uniforms.uTouch,
            'uWorldPosition'        : params.uniforms.uWorldPosition,
            'uModelMatrix'          : { type: 'm4', value: this.mesh.matrix }
        },

        vertexShader                : vs_simpleQuad,
        fragmentShader              : fs_updateSpring

    } );

    this.updatePositionsMaterial = new THREE.RawShaderMaterial({
        'uniforms': {
            'uPrevPositions'        : { type: 't', value: this.geometryRT },
            'uSpringTexture'        : { type: 't', value: this.springRT }
        },

        vertexShader                : vs_simpleQuad,
        fragmentShader              : fs_updatePositions

    });

    this.planeDebug = new THREE.Mesh( this.quad_geom, new THREE.MeshBasicMaterial({map:this.springRT}));
    this.planeDebug.rotation.x = Math.PI * 1.5;

    this.springPositionsTargets     = [  this.springRT,  this.springRT.clone() ];
    this.finalPositionsTargets      = [  this.finalPositionsRT,  this.finalPositionsRT.clone() ];

    this.pass( this.updateSpringMaterial, this.springPositionsTargets[ this.pingpong ] );
    this.pass( this.updatePositionsMaterial, this.finalPositionsTargets[ this.pingpong ] );

};

GPUDisplacedGeometry.prototype = Object.create( BaseGLPass.prototype );

GPUDisplacedGeometry.prototype.update = function() {

    this.updateSpringMaterial.uniforms.uPrevPositions.value = this.springPositionsTargets[ this.pingpong ];
    this.updateSpringMaterial.uniforms.uPrevPositionsGeom.value = this.finalPositionsTargets[ this.pingpong ];

    this.updatePositionsMaterial.uniforms.uSpringTexture.value = this.springPositionsTargets[ this.pingpong ];
    this.updatePositionsMaterial.uniforms.uPrevPositions.value = this.finalPositionsTargets[ this.pingpong ];

    this.bufferMaterial.uniforms.uPositionsTexture.value = this.finalPositionsTargets[ this.pingpong ];
    this.bufferMaterial.needsUpdate = true;;

    this.pingpong = 1 - this.pingpong;
    this.pass( this.updateSpringMaterial, this.springPositionsTargets[ this.pingpong ] );
    this.pass( this.updatePositionsMaterial, this.finalPositionsTargets[ this.pingpong ] );

    this.bufferMaterial.uniforms.pointLightIntensity.value[0] = this.lights[0].intensity;
    this.bufferMaterial.uniforms.pointLightIntensity.value[1] = this.lights[1].intensity;
};

module.exports = GPUDisplacedGeometry;