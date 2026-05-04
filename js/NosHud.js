import { NOS_DURATION } from './Vehicle.js';

export class NosHud {

	constructor() {

		const css = document.createElement( 'style' );
		css.textContent = `
			.nos-hud {
				position: fixed;
				left: 14px;
				bottom: 14px;
				z-index: 20;
				font-family: system-ui, sans-serif;
				user-select: none;
				pointer-events: none;
			}
			.nos-hud__label {
				font-size: 10px;
				font-weight: 700;
				letter-spacing: 0.08em;
				color: rgba( 255, 255, 255, 0.55 );
				margin-bottom: 4px;
				text-shadow: 0 1px 2px rgba( 0, 0, 0, 0.5 );
			}
			.nos-hud__track {
				width: 112px;
				height: 8px;
				border-radius: 4px;
				background: rgba( 0, 0, 0, 0.45 );
				box-shadow: inset 0 1px 2px rgba( 0, 0, 0, 0.45 );
				overflow: hidden;
				position: relative;
			}
			.nos-hud__fill {
				position: absolute;
				left: 0;
				top: 0;
				bottom: 0;
				width: 100%;
				transform-origin: left center;
				transform: scaleX( 1 );
				border-radius: 4px;
				background: linear-gradient( 180deg, #ff6b4a 0%, #c41e3a 55%, #8b1538 100% );
				box-shadow: 0 0 10px rgba( 255, 60, 80, 0.45 );
				transition: transform 0.08s ease-out;
			}
		`;
		document.head.appendChild( css );

		this.root = document.createElement( 'div' );
		this.root.className = 'nos-hud';
		this.root.innerHTML = `
			<div class="nos-hud__label">NOS (X)</div>
			<div class="nos-hud__track">
				<div class="nos-hud__fill"></div>
			</div>
		`;
		document.body.appendChild( this.root );

		this.fill = this.root.querySelector( '.nos-hud__fill' );

	}

	update( vehicle ) {

		const frac = Math.min( 1, Math.max( 0, vehicle.nosTankRemaining / NOS_DURATION ) );
		this.fill.style.transform = `scaleX( ${ frac } )`;

	}

}
