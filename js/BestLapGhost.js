import * as THREE from 'three';
import { Vehicle } from './Vehicle.js';
import { SmokeTrails, NosTaillightTrails } from './Particles.js';

const SCHEMA = 2;
const STORAGE_PREFIX = 'racing.bestLapGhost.v';
const SAMPLE_HZ = 25;
const SAMPLE_DT = 1 / SAMPLE_HZ;
const GHOST_OPACITY = 0.2;
const PARTICLE_OPACITY_SCALE = 0.2;
const DELTA_Y_OFFSET = 1.0;
const DELTA_SPRITE_SCALE = .85;
const DELTA_RED = '#d43f52';
const DELTA_BLUE = '#2d63c9';

/** Per-frame: pos(3) + quat(4) + linearSpeed, acceleration, inputX, nosBit, nosIntensity, driftIntensity */
const FRAME_LEN = 13;

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();

function applyGhostMaterials( root ) {

	root.traverse( ( child ) => {

		if ( ! child.isMesh || ! child.material ) return;

		const mats = Array.isArray( child.material ) ? child.material : [ child.material ];
		const clones = mats.map( ( m ) => {

			const c = m.clone();
			c.transparent = true;
			c.opacity = GHOST_OPACITY;
			c.depthWrite = false;
			return c;

		} );

		child.material = clones.length === 1 ? clones[ 0 ] : clones;
		child.castShadow = false;

	} );

}

function frameFromVehicle( container, vehicle ) {

	const p = container.position;
	const q = container.quaternion;
	return [
		p.x, p.y, p.z,
		q.x, q.y, q.z, q.w,
		vehicle.linearSpeed,
		vehicle.acceleration,
		vehicle.inputX,
		vehicle.nosActive ? 1 : 0,
		vehicle.nosIntensity,
		vehicle.driftIntensity,
	];

}

function parseRecording( raw ) {

	if ( typeof raw !== 'string' ) return null;

	let data;

	try {

		data = JSON.parse( raw );

	} catch {

		return null;

	}

	if ( data.v !== SCHEMA || typeof data.lapTime !== 'number' || ! Array.isArray( data.frames ) ) return null;

	const hz = typeof data.sampleHz === 'number' && data.sampleHz > 0 ? data.sampleHz : SAMPLE_HZ;
	const frames = data.frames;

	if ( frames.length < 2 ) return null;

	for ( const row of frames ) {

		if ( ! Array.isArray( row ) || row.length !== FRAME_LEN ) return null;

		for ( const n of row ) {

			if ( typeof n !== 'number' || ! Number.isFinite( n ) ) return null;

		}

	}

	return { lapTime: data.lapTime, sampleHz: hz, frames };

}

function createDeltaLabel() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 512;
	canvas.height = 192;

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;

	const material = new THREE.SpriteMaterial( {
		map: texture,
		transparent: true,
		depthWrite: false,
	} );

	const sprite = new THREE.Sprite( material );
	sprite.visible = false;
	sprite.renderOrder = 40;
	sprite.scale.set( DELTA_SPRITE_SCALE, DELTA_SPRITE_SCALE * 0.375, 1 );
	sprite.position.set( 0, DELTA_Y_OFFSET, 0 );

	return { sprite, canvas, texture };

}

export class BestLapGhost {

	constructor( scene, trackId, vehicleModel ) {

		this.scene = scene;
		this.trackId = trackId || 'default';
		this.storageKey = `${ STORAGE_PREFIX }${ SCHEMA }.${ this.trackId }`;

		this.buffer = [];
		this.sampleAcc = 0;

		this.recording = null;

		this.ghostVehicle = new Vehicle();
		const ghostGroup = this.ghostVehicle.init( vehicleModel );
		applyGhostMaterials( ghostGroup );
		this.ghostVehicle.container.visible = false;
		this.scene.add( this.ghostVehicle.container );

		this.ghostSmoke = new SmokeTrails( scene, { opacityScale: PARTICLE_OPACITY_SCALE } );
		this.ghostNos = new NosTaillightTrails( scene, { opacityScale: PARTICLE_OPACITY_SCALE } );
		const label = createDeltaLabel();
		this.deltaLabel = label.sprite;
		this.deltaCanvas = label.canvas;
		this.deltaTexture = label.texture;
		this.deltaLabelState = '';
		this.ghostVehicle.container.add( this.deltaLabel );

		this.ghostVisible = true;

		this._loadFromStorage();

	}

	setGhostVisible( visible ) {

		this.ghostVisible = visible !== false;

	}

	_loadFromStorage() {

		try {

			const raw = localStorage.getItem( this.storageKey );
			if ( raw === null ) return;

			this.recording = parseRecording( raw );

		} catch {

			this.recording = null;

		}

	}

	record( dt, lapTimer, vehicle ) {

		if ( ! lapTimer.enabled || ! lapTimer.running ) return;

		this.sampleAcc += dt;

		while ( this.sampleAcc >= SAMPLE_DT ) {

			this.sampleAcc -= SAMPLE_DT;
			this.buffer.push( frameFromVehicle( vehicle.container, vehicle ) );

		}

	}

	/**
	 * Invoked from LapTimer onLapComplete; pass live vehicle for a closing keyframe when isBest.
	 */
	commitLap( { isBest, lastLap }, vehicle ) {

		if ( isBest ) {

			this.buffer.push( frameFromVehicle( vehicle.container, vehicle ) );

			this._trySaveRecording( lastLap );

		} else {

			this.buffer.length = 0;
			this.sampleAcc = 0;

		}

	}

	_trySaveRecording( lastLap ) {

		if ( this.buffer.length < 2 ) {

			this.buffer.length = 0;
			this.sampleAcc = 0;
			return;

		}

		const payload = {
			v: SCHEMA,
			lapTime: lastLap,
			sampleHz: SAMPLE_HZ,
			frames: this.buffer.slice(),
		};

		try {

			localStorage.setItem( this.storageKey, JSON.stringify( payload ) );
			this.recording = parseRecording( localStorage.getItem( this.storageKey ) );

		} catch {

			this._loadFromStorage();

		}

		this.buffer.length = 0;
		this.sampleAcc = 0;

	}

	_updateDeltaLabel( deltaSeconds ) {

		if ( ! Number.isFinite( deltaSeconds ) ) {

			this.deltaLabel.visible = false;
			return;

		}

		const ahead = deltaSeconds > 0;
		const color = ahead ? DELTA_BLUE : DELTA_RED;
		const sign = ahead ? '+' : '-';
		const txt = `${ sign } ${ Math.abs( deltaSeconds ).toFixed( 3 ) }s`;
		const key = `${ color }|${ txt }`;

		this.deltaLabel.visible = true;
		if ( this.deltaLabelState === key ) return;

		this.deltaLabelState = key;

		const ctx = this.deltaCanvas.getContext( '2d' );
		const w = this.deltaCanvas.width;
		const h = this.deltaCanvas.height;
		const pad = 16;
		const bw = w - pad * 2;
		const bh = h - pad * 2;
		const bx = pad;
		const by = pad;
		const chipR = bh * 0.5;

		ctx.clearRect( 0, 0, w, h );
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.roundRect( bx, by, bw, bh, chipR );
		ctx.fill();

		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 66px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
		ctx.fillText( txt, w * 0.5, by + bh * 0.5 );

		this.deltaTexture.needsUpdate = true;

	}

	_computeDeltaAtPlayer( frames, sampleDt, playerPosition, currentLapTime ) {

		if ( ! playerPosition ) return null;

		let bestIdx = 0;
		let bestD2 = Infinity;

		for ( let i = 0; i < frames.length; i ++ ) {

			const f = frames[ i ];
			const dx = f[ 0 ] - playerPosition.x;
			const dz = f[ 2 ] - playerPosition.z;
			const d2 = dx * dx + dz * dz;
			if ( d2 < bestD2 ) {

				bestD2 = d2;
				bestIdx = i;

			}

		}

		const ghostTimeAtPlayer = bestIdx * sampleDt;
		return ghostTimeAtPlayer - currentLapTime;

	}

	update( dt, lapTimer, playerPosition ) {

		const rec = this.recording;
		const gv = this.ghostVehicle;

		if ( ! rec || ! lapTimer.enabled ) {

			gv.container.visible = false;
			this.deltaLabel.visible = false;
			this.ghostSmoke.points.visible = false;
			this.ghostNos.points.visible = false;
			return;

		}

		const { lapTime, sampleHz, frames } = rec;
		const sampleDt = 1 / sampleHz;
		const n = frames.length;

		if ( n < 2 ) {

			gv.container.visible = false;
			this.deltaLabel.visible = false;
			this.ghostSmoke.points.visible = false;
			this.ghostNos.points.visible = false;
			return;

		}

		const t = Math.min( lapTimer.currentLapTime, lapTime );
		const span = ( n - 1 ) * sampleDt;
		const tPlay = Math.min( t, span );
		const f = tPlay / sampleDt;
		const i0 = Math.min( Math.floor( f ), n - 2 );
		const u = f - i0;
		const nearestIdx = Math.min( n - 1, Math.max( 0, Math.round( f ) ) );

		const pastEnd = lapTimer.currentLapTime >= lapTime - 1e-4;

		const a = frames[ i0 ];
		const b = frames[ i0 + 1 ];

		if ( pastEnd ) {

			const L = frames[ n - 1 ];
			gv.container.position.set( L[ 0 ], L[ 1 ], L[ 2 ] );
			gv.container.quaternion.set( L[ 3 ], L[ 4 ], L[ 5 ], L[ 6 ] );
			gv.linearSpeed = L[ 7 ];
			gv.acceleration = L[ 8 ];
			gv.inputX = L[ 9 ];
			gv.inputZ = 0;
			gv.nosActive = false;
			gv.nosIntensity = 0;
			gv.driftIntensity = 0;

			this.ghostSmoke.update( dt, gv );
			this.ghostNos.update( dt, gv );

		} else {

			_p0.set( a[ 0 ], a[ 1 ], a[ 2 ] );
			_p1.set( b[ 0 ], b[ 1 ], b[ 2 ] );
			gv.container.position.lerpVectors( _p0, _p1, u );

			_q0.set( a[ 3 ], a[ 4 ], a[ 5 ], a[ 6 ] );
			_q1.set( b[ 3 ], b[ 4 ], b[ 5 ], b[ 6 ] );
			gv.container.quaternion.copy( _q0 ).slerp( _q1, u );

			gv.linearSpeed = THREE.MathUtils.lerp( a[ 7 ], b[ 7 ], u );
			gv.acceleration = THREE.MathUtils.lerp( a[ 8 ], b[ 8 ], u );
			gv.inputX = THREE.MathUtils.lerp( a[ 9 ], b[ 9 ], u );
			gv.inputZ = 0;
			gv.nosIntensity = THREE.MathUtils.lerp( a[ 11 ], b[ 11 ], u );
			gv.driftIntensity = THREE.MathUtils.lerp( a[ 12 ], b[ 12 ], u );
			gv.nosActive = frames[ nearestIdx ][ 10 ] >= 0.5;

			gv.updateBody( dt );
			gv.updateWheels( dt );

			this.ghostSmoke.update( dt, gv );
			this.ghostNos.update( dt, gv );

		}

		if ( this.ghostVisible ) {

			gv.container.visible = true;
			this._updateDeltaLabel( this._computeDeltaAtPlayer( frames, sampleDt, playerPosition, lapTimer.currentLapTime ) );
			this.ghostSmoke.points.visible = true;
			this.ghostNos.points.visible = true;

		} else {

			gv.container.visible = false;
			this.deltaLabel.visible = false;
			this.ghostSmoke.points.visible = false;
			this.ghostNos.points.visible = false;

		}

	}

}
