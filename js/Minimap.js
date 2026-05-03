import * as THREE from 'three';
import { CELL_RAW, GRID_SCALE, computeTrackBounds, ORIENT_DEG } from './Track.js';

const S = CELL_RAW * GRID_SCALE;

const DECO = {
	'decoration-forest': { fill: '#0f1a14', stroke: '#0a120e' },
	'decoration-empty': { fill: '#122018', stroke: '#0c1510' },
	'decoration-tents': { fill: '#161c20', stroke: '#101418' },
};

const ROAD_BASE = {
	'track-straight': { fill: '#0e1014', stroke: '#1a1e24' },
	'track-corner': { fill: '#0c0e12', stroke: '#181c22' },
	'track-bump': { fill: '#1a140c', stroke: '#2a2010' },
	'track-finish': { fill: '#0e1014', stroke: '#2a2a30' },
};

const LEGEND_ORDER = [
	[ 'track-straight', 'Straight' ],
	[ 'track-corner', 'Corner' ],
	[ 'track-bump', 'Bump' ],
	[ 'track-finish', 'Finish' ],
	[ 'decoration-forest', 'Forest' ],
	[ 'decoration-empty', 'Grass' ],
	[ 'decoration-tents', 'Tents' ],
];

function isRoad( key ) {

	return key.startsWith( 'track-' );

}

export class Minimap {

	constructor( cells ) {

		this.cells = cells;
		this.bounds = computeTrackBounds( cells );
		this._typesPresent = new Set( cells.map( ( c ) => c[ 2 ] ) );

		this._cssW = 200;
		this._cssH = 200;

		this._onResize = this._onResize.bind( this );
		window.addEventListener( 'resize', this._onResize );

		this._buildUI();
		this._onResize();

	}

	_buildUI() {

		const style = document.createElement( 'style' );
		style.textContent = `
			#minimap {
				color: #fff;
				font: 500 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
				background: rgba(0,0,0,0.5);
				padding: 8px 10px 10px;
				border-radius: 10px;
				text-shadow: 0 1px 2px rgba(0,0,0,0.6);
				user-select: none;
				pointer-events: none;
				backdrop-filter: blur(8px);
				-webkit-backdrop-filter: blur(8px);
				min-width: 140px;
			}
			#minimap .minimap-title {
				opacity: 0.7;
				letter-spacing: 0.08em;
				margin-bottom: 6px;
				font-size: 10px;
			}
			#minimap canvas {
				display: block;
				width: ${ this._cssW }px;
				height: ${ this._cssH }px;
				border-radius: 6px;
				background: #000;
			}
			#minimap .legend {
				display: flex;
				flex-wrap: wrap;
				gap: 6px 10px;
				margin-top: 8px;
				max-width: ${ this._cssW + 24 }px;
				line-height: 1.2;
			}
			#minimap .legend-item {
				display: inline-flex;
				align-items: center;
				gap: 4px;
				opacity: 0.92;
			}
			#minimap .swatch {
				width: 10px;
				height: 10px;
				border-radius: 2px;
				border: 1px solid rgba(255,255,255,0.2);
				flex-shrink: 0;
			}
		`;
		document.head.appendChild( style );

		const root = document.createElement( 'div' );
		root.id = 'minimap';
		root.innerHTML =
			'<div class="minimap-title">MAP</div>' +
			'<canvas class="minimap-canvas" aria-hidden="true"></canvas>' +
			'<div class="legend"></div>';

		const legend = root.querySelector( '.legend' );
		for ( const [ type, label ] of LEGEND_ORDER ) {

			if ( ! this._typesPresent.has( type ) ) continue;

			const fill = DECO[ type ]?.fill || ROAD_BASE[ type ]?.fill || '#555';
			const item = document.createElement( 'span' );
			item.className = 'legend-item';
			item.innerHTML = `<span class="swatch" style="background:${ fill }"></span>${ label }`;
			legend.appendChild( item );

		}

		this.canvas = root.querySelector( 'canvas' );
		this.ctx = this.canvas.getContext( '2d' );

		( document.getElementById( 'hud-column' ) || document.body ).appendChild( root );

	}

	_onResize() {

		const dpr = Math.min( window.devicePixelRatio || 1, 2 );
		const w = Math.round( this._cssW * dpr );
		const h = Math.round( this._cssH * dpr );

		this.canvas.width = w;
		this.canvas.height = h;

		this._dpr = dpr;
		const pad = 10 * dpr;
		const inner = Math.min( w, h ) - 2 * pad;
		const { halfWidth, halfDepth } = this.bounds;
		const halfExtent = Math.max( halfWidth, halfDepth );
		this._scale = inner / ( 2 * halfExtent );
		this._cx = w / 2;
		this._cy = h / 2;

	}

	/**
	 * Player-centered map: +camForwardXZ maps to screen-up (negative canvas Y).
	 */
	_worldToScreen( x, z ) {

		const dx = x - this._playX;
		const dz = z - this._playZ;
		const fx = this._camFx;
		const fz = this._camFz;
		const rx = - fz;
		const rz = fx;
		const u = dx * rx + dz * rz;
		const v = dx * fx + dz * fz;
		return [ this._cx + u * this._scale, this._cy - v * this._scale ];

	}

	_drawCellPoly( ctx, cell, isDeco ) {

		const [ gx, gz, key ] = cell;
		const x0 = gx * S;
		const z0 = gz * S;
		const x1 = ( gx + 1 ) * S;
		const z1 = ( gz + 1 ) * S;
		const corners = [
			[ x0, z0 ], [ x1, z0 ], [ x1, z1 ], [ x0, z1 ],
		];

		ctx.beginPath();
		for ( let i = 0; i < 4; i ++ ) {

			const [ px, py ] = this._worldToScreen( corners[ i ][ 0 ], corners[ i ][ 1 ] );
			if ( i === 0 ) ctx.moveTo( px, py );
			else ctx.lineTo( px, py );

		}
		ctx.closePath();

		if ( isDeco ) {

			const spec = DECO[ key ] || DECO[ 'decoration-empty' ];
			ctx.fillStyle = spec.fill;
			ctx.strokeStyle = spec.stroke;
			ctx.lineWidth = Math.max( 1, this._dpr );
			ctx.fill();
			ctx.stroke();
			return;

		}

		const spec = ROAD_BASE[ key ] || ROAD_BASE[ 'track-straight' ];
		ctx.fillStyle = spec.fill;
		ctx.strokeStyle = spec.stroke;
		ctx.lineWidth = Math.max( 1, this._dpr );
		ctx.fill();
		ctx.stroke();

	}

	_drawRoadCenterline( ctx, cell ) {

		const [ gx, gz, key, orient ] = cell;
		const deg = ORIENT_DEG[ orient ] ?? 0;
		const rad = THREE.MathUtils.degToRad( deg );
		const cxw = ( gx + 0.5 ) * S;
		const czw = ( gz + 0.5 ) * S;
		const half = S * 0.38;

		ctx.strokeStyle = '#f5f5f5';
		ctx.lineWidth = Math.max( 3.2, this._dpr * 3.5 );
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		if ( key === 'track-straight' ) {

			const dx = Math.sin( rad ) * half;
			const dz = Math.cos( rad ) * half;
			const [ ax, ay ] = this._worldToScreen( cxw - dx, czw - dz );
			const [ bx, by ] = this._worldToScreen( cxw + dx, czw + dz );
			ctx.beginPath();
			ctx.moveTo( ax, ay );
			ctx.lineTo( bx, by );
			ctx.stroke();

		} else if ( key === 'track-corner' ) {

			const rW = S * 0.36;
			const lx0 = - S * 0.12;
			const lz0 = S * 0.12;
			const steps = 12;
			ctx.beginPath();
			for ( let i = 0; i <= steps; i ++ ) {

				const t = - Math.PI / 2 + ( i / steps ) * ( Math.PI / 2 );
				const lx = lx0 + rW * Math.cos( t );
				const lz = lz0 + rW * Math.sin( t );
				const wx = cxw + lx * Math.cos( rad ) - lz * Math.sin( rad );
				const wz = czw + lx * Math.sin( rad ) + lz * Math.cos( rad );
				const [ px, py ] = this._worldToScreen( wx, wz );
				if ( i === 0 ) ctx.moveTo( px, py );
				else ctx.lineTo( px, py );

			}
			ctx.stroke();

		} else if ( key === 'track-finish' || key === 'track-bump' ) {

			const dx = Math.sin( rad ) * half * 0.85;
			const dz = Math.cos( rad ) * half * 0.85;
			const [ ax, ay ] = this._worldToScreen( cxw - dx, czw - dz );
			const [ bx, by ] = this._worldToScreen( cxw + dx, czw + dz );
			ctx.beginPath();
			ctx.moveTo( ax, ay );
			ctx.lineTo( bx, by );
			ctx.stroke();

		}

	}

	update( position, cameraForwardXZ, vehicleForwardXZ ) {

		const fx = cameraForwardXZ.x;
		const fz = cameraForwardXZ.z;
		const fl = Math.hypot( fx, fz ) || 1;
		this._camFx = fx / fl;
		this._camFz = fz / fl;
		this._playX = position.x;
		this._playZ = position.z;

		const ctx = this.ctx;
		const w = this.canvas.width;
		const h = this.canvas.height;

		ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		ctx.fillStyle = '#000000';
		ctx.fillRect( 0, 0, w, h );

		const deco = [];
		const road = [];
		for ( const c of this.cells ) {

			if ( isRoad( c[ 2 ] ) ) road.push( c );
			else deco.push( c );

		}

		for ( const c of deco ) this._drawCellPoly( ctx, c, true );
		for ( const c of road ) this._drawCellPoly( ctx, c, false );

		for ( const c of road ) this._drawRoadCenterline( ctx, c );

		const vfx = vehicleForwardXZ.x;
		const vfz = vehicleForwardXZ.z;
		const vl = Math.hypot( vfx, vfz ) || 1;
		const vxn = vfx / vl;
		const vzn = vfz / vl;
		const rx = - this._camFz;
		const rz = this._camFx;
		const vu = vxn * rx + vzn * rz;
		const vv = vxn * this._camFx + vzn * this._camFz;
		const heading = Math.atan2( - vv, vu );

		const r = Math.max( 6, 8 * this._dpr );
		const tip = 4 * this._dpr;

		ctx.save();
		ctx.translate( this._cx, this._cy );
		ctx.rotate( heading );
		ctx.fillStyle = '#ffdd55';
		ctx.strokeStyle = '#1a1206';
		ctx.lineWidth = Math.max( 1.2, this._dpr * 1.2 );
		ctx.beginPath();
		ctx.moveTo( r + tip, 0 );
		ctx.lineTo( - r * 0.65, r * 0.55 );
		ctx.lineTo( - r * 0.35, 0 );
		ctx.lineTo( - r * 0.65, - r * 0.55 );
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
		ctx.restore();

	}

}
