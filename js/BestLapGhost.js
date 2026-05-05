import * as THREE from 'three';

const SCHEMA = 1;
const STORAGE_PREFIX = 'racing.bestLapGhost.v';
const SAMPLE_HZ = 25;
const SAMPLE_DT = 1 / SAMPLE_HZ;
const GHOST_OPACITY = 0.2;

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

		if ( ! Array.isArray( row ) || row.length !== 7 ) return null;

		for ( const n of row ) {

			if ( typeof n !== 'number' || ! Number.isFinite( n ) ) return null;

		}

	}

	return { lapTime: data.lapTime, sampleHz: hz, frames };

}

export class BestLapGhost {

	constructor( scene, trackId, vehicleModel ) {

		this.scene = scene;
		this.trackId = trackId || 'default';
		this.storageKey = `${ STORAGE_PREFIX }${ SCHEMA }.${ this.trackId }`;

		this.buffer = [];
		this.sampleAcc = 0;

		this.recording = null;

		this.root = new THREE.Group();
		const clone = vehicleModel.clone( true );
		this.root.add( clone );
		applyGhostMaterials( this.root );
		this.root.visible = false;
		this.scene.add( this.root );

		this._loadFromStorage();

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

	record( dt, lapTimer, container ) {

		if ( ! lapTimer.enabled || ! lapTimer.running ) return;

		this.sampleAcc += dt;

		while ( this.sampleAcc >= SAMPLE_DT ) {

			this.sampleAcc -= SAMPLE_DT;
			const p = container.position;
			const q = container.quaternion;
			this.buffer.push( [ p.x, p.y, p.z, q.x, q.y, q.z, q.w ] );

		}

	}

	/**
	 * Invoked from LapTimer onLapComplete; pass live vehicle container for a closing keyframe when isBest.
	 */
	commitLap( { isBest, lastLap }, container ) {

		if ( isBest ) {

			const p = container.position;
			const q = container.quaternion;
			this.buffer.push( [ p.x, p.y, p.z, q.x, q.y, q.z, q.w ] );

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

	updatePlayback( lapTimer ) {

		const rec = this.recording;

		if ( ! rec || ! lapTimer.enabled ) {

			this.root.visible = false;
			return;

		}

		const { lapTime, sampleHz, frames } = rec;
		const dt = 1 / sampleHz;
		const n = frames.length;

		if ( n < 2 ) {

			this.root.visible = false;
			return;

		}

		const t = Math.min( lapTimer.currentLapTime, lapTime );
		const span = ( n - 1 ) * dt;
		const tPlay = Math.min( t, span );
		const f = tPlay / dt;
		const i0 = Math.min( Math.floor( f ), n - 2 );
		const u = f - i0;

		const a = frames[ i0 ];
		const b = frames[ i0 + 1 ];

		_p0.set( a[ 0 ], a[ 1 ], a[ 2 ] );
		_p1.set( b[ 0 ], b[ 1 ], b[ 2 ] );
		this.root.position.lerpVectors( _p0, _p1, u );

		_q0.set( a[ 3 ], a[ 4 ], a[ 5 ], a[ 6 ] );
		_q1.set( b[ 3 ], b[ 4 ], b[ 5 ], b[ 6 ] );
		this.root.quaternion.copy( _q0 ).slerp( _q1, u );

		this.root.visible = true;

	}

}
