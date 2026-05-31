(() => {
	const canvas = document.getElementById('canvas');
	const gl = canvas.getContext('webgl', { alpha: false, antialias: true });

	if (!gl) {
		throw new Error('WebGL is not supported in this browser.');
	}

	const vertexShaderSource = `
		attribute vec2 a_position;
		attribute float a_size;
		attribute vec4 a_color;
		attribute float a_sprite;

		uniform vec2 u_resolution;

		varying vec4 v_color;
		varying float v_sprite;

		void main() {
			vec2 zeroToOne = a_position / u_resolution;
			vec2 zeroToTwo = zeroToOne * 2.0;
			vec2 clipSpace = zeroToTwo - 1.0;

			gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
			gl_PointSize = a_size;
			v_color = a_color;
			v_sprite = a_sprite;
		}
	`;

	const fragmentShaderSource = `
		precision mediump float;

		uniform sampler2D u_bengTexture;
		uniform sampler2D u_snowTexture;
		uniform float u_bengReady;
		uniform float u_snowReady;

		varying vec4 v_color;
		varying float v_sprite;

		void main() {
			vec2 p = gl_PointCoord - vec2(0.5);
			float d = length(p) * 2.0;
			float core = smoothstep(0.75, 0.0, d);
			float glow = smoothstep(1.0, 0.2, d) * 0.35;
			float radialAlpha = (core + glow) * v_color.a;
			int spriteType = int(floor(v_sprite + 0.5));

			if (spriteType == 1 && u_bengReady > 0.5) {
				vec4 sprite = texture2D(u_bengTexture, gl_PointCoord);
				gl_FragColor = vec4(v_color.rgb * sprite.rgb, v_color.a * sprite.a);
				return;
			}

			if (spriteType == 2 && u_snowReady > 0.5) {
				vec4 sprite = texture2D(u_snowTexture, gl_PointCoord);
				gl_FragColor = vec4(v_color.rgb * sprite.rgb, v_color.a * sprite.a);
				return;
			}

			gl_FragColor = vec4(v_color.rgb, radialAlpha);
		}
	`;

	const trailVertexShaderSource = `
		attribute vec2 a_position;
		attribute vec3 a_color;

		uniform vec2 u_resolution;

		varying vec3 v_color;

		void main() {
			vec2 zeroToOne = a_position / u_resolution;
			vec2 zeroToTwo = zeroToOne * 2.0;
			vec2 clipSpace = zeroToTwo - 1.0;

			v_color = a_color;
			gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
		}
	`;

	const trailFragmentShaderSource = `
		precision mediump float;

		varying vec3 v_color;

		void main() {
			gl_FragColor = vec4(v_color, 1.0);
		}
	`;

	function createShader(type, source) {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const message = gl.getShaderInfoLog(shader);
			gl.deleteShader(shader);
			throw new Error(`Shader compile error: ${message}`);
		}

		return shader;
	}

	function createProgram(vsSource, fsSource) {
		const vertexShader = createShader(gl.VERTEX_SHADER, vsSource);
		const fragmentShader = createShader(gl.FRAGMENT_SHADER, fsSource);

		const program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const message = gl.getProgramInfoLog(program);
			gl.deleteProgram(program);
			throw new Error(`Program link error: ${message}`);
		}

		return program;
	}

	function randomRange(min, max) {
		return min + Math.random() * (max - min);
	}

	function lerp(a, b, t) {
		return a + (b - a) * t;
	}

	function emissionCount(ratePerSecond, dt) {
		const expected = ratePerSecond * dt;
		const whole = Math.floor(expected);
		return whole + (Math.random() < expected - whole ? 1 : 0);
	}

	function gradientColor(u) {
		const t = ((u % 1) + 1) % 1;
		const stops = [
			[0.0, [0.14, 0.88, 0.74]],
			[0.34, [0.2, 0.58, 1.0]],
			[0.68, [0.56, 0.4, 1.0]],
			[1.0, [0.95, 0.54, 0.8]]
		];

		for (let i = 0; i < stops.length - 1; i += 1) {
			const left = stops[i];
			const right = stops[i + 1];
			if (t >= left[0] && t <= right[0]) {
				const k = (t - left[0]) / (right[0] - left[0]);
				return [
					lerp(left[1][0], right[1][0], k),
					lerp(left[1][1], right[1][1], k),
					lerp(left[1][2], right[1][2], k)
				];
			}
		}

		return [0.2, 0.58, 1.0];
	}

	function createTexturePlaceholder() {
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array([255, 255, 255, 255])
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		return texture;
	}

	function loadTexture(texture, src, onReady) {
		const image = new Image();
		image.onload = () => {
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			onReady();
		};
		image.src = src;
	}

	const particleProgram = createProgram(vertexShaderSource, fragmentShaderSource);
	const trailProgram = createProgram(trailVertexShaderSource, trailFragmentShaderSource);

	const loc = {
		position: gl.getAttribLocation(particleProgram, 'a_position'),
		size: gl.getAttribLocation(particleProgram, 'a_size'),
		color: gl.getAttribLocation(particleProgram, 'a_color'),
		sprite: gl.getAttribLocation(particleProgram, 'a_sprite'),
		resolution: gl.getUniformLocation(particleProgram, 'u_resolution'),
		bengTexture: gl.getUniformLocation(particleProgram, 'u_bengTexture'),
		snowTexture: gl.getUniformLocation(particleProgram, 'u_snowTexture'),
		bengReady: gl.getUniformLocation(particleProgram, 'u_bengReady'),
		snowReady: gl.getUniformLocation(particleProgram, 'u_snowReady')
	};

	const trailLoc = {
		position: gl.getAttribLocation(trailProgram, 'a_position'),
		color: gl.getAttribLocation(trailProgram, 'a_color'),
		resolution: gl.getUniformLocation(trailProgram, 'u_resolution')
	};

	const positionBuffer = gl.createBuffer();
	const sizeBuffer = gl.createBuffer();
	const colorBuffer = gl.createBuffer();
	const spriteBuffer = gl.createBuffer();
	const trailPositionBuffer = gl.createBuffer();
	const trailColorBuffer = gl.createBuffer();

	const sparklerTexture = createTexturePlaceholder();
	let sparklerTextureReady = false;
	loadTexture(sparklerTexture, 'beng_light.png', () => {
		sparklerTextureReady = true;
	});

	const snowTexture = createTexturePlaceholder();
	let snowTextureReady = false;
	loadTexture(snowTexture, 'snowflake.png', () => {
		snowTextureReady = true;
	});

	let width = 1;
	let height = 1;

	function resize() {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const displayWidth = Math.floor(window.innerWidth * dpr);
		const displayHeight = Math.floor(window.innerHeight * dpr);

		if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
			canvas.width = displayWidth;
			canvas.height = displayHeight;
		}

		width = canvas.width;
		height = canvas.height;
		gl.viewport(0, 0, width, height);
	}

	window.addEventListener('resize', resize);
	resize();

	const gravity = 450;
	const particles = [];
	const rockets = [];
	const SPRITE_NONE = 0;
	const SPRITE_BENG = 1;
	const SPRITE_SNOW = 2;

	const state = {
		mode: 1,
		time: 0,
		fireworkTimer: 0.8,
		maxParticles: 18000,
		sizeScale: 1.7,
		snowExtraScale: 1.55,
		modeNames: {
			1: '1: Beng lights',
			2: '2: Smoke',
			3: '3: Rain',
			4: '4: Clouds + Steam',
			5: '5: Fireworks',
			6: '6: Spiral Galaxy',
			7: 'E: Snow',
			8: 'Q: Sparkler Lecture'
		}
	};

	const infoDiv = document.getElementById('info');

	const modeKeyList = [
		{ key: '1', mode: 1, label: 'Sparkler' },
		{ key: '2', mode: 2, label: 'Smoke' },
		{ key: '3', mode: 3, label: 'Rain' },
		{ key: '4', mode: 4, label: 'Clouds + Steam' },
		{ key: '5', mode: 5, label: 'Fireworks' },
		{ key: '6', mode: 6, label: 'Spiral Galaxy' },
		{ key: 'E', mode: 7, label: 'Snow' },
		{ key: 'Q', mode: 8, label: 'Sparkler Lecture' }
	];

	function updateInfo() {
		if (!infoDiv) return;
		const rows = modeKeyList.map((it) => {
			const active = it.mode === state.mode;
			const k = `<b style="display:inline-block;width:14px;color:${active ? '#7df' : '#aaa'}">${it.key}</b>`;
			const text = active
				? `<span style="color:#7df">${it.label}</span>`
				: `<span style="opacity:0.7">${it.label}</span>`;
			return `${k} ${text}`;
		}).join('<br>');
		infoDiv.innerHTML = `<b>Режим:</b> ${state.modeNames[state.mode].replace(/^\d+:\s*|^[EQ]:\s*/, '')}<hr style="border:0;border-top:1px solid #444;margin:6px 0">${rows}`;
	}

	function setMode(mode) {
		state.mode = mode;
		particles.length = 0;
		rockets.length = 0;
		state.fireworkTimer = 0.5;
		document.title = `Lab 6 - ${state.modeNames[mode]}`;
		console.log(`Mode ${mode} enabled`);
		updateInfo();
	}

	window.addEventListener('keydown', (event) => {
		const key = Number(event.key);
		if (key >= 1 && key <= 6) {
			setMode(key);
			return;
		}

		if (event.key === 'e' || event.key === 'E' || event.key === 'у' || event.key === 'У') {
			setMode(7);
			return;
		}

		if (event.key === 'q' || event.key === 'Q' || event.key === 'й' || event.key === 'Й') {
			setMode(8);
		}
	});

	function spawnParticle(p) {
		const sizeScale = p.sizeScale == null ? state.sizeScale : p.sizeScale;
		const spriteType = p.spriteType == null ? SPRITE_NONE : p.spriteType;
		const normalizedSpriteType = spriteType === SPRITE_BENG
			? SPRITE_BENG
			: (spriteType === SPRITE_SNOW ? SPRITE_SNOW : SPRITE_NONE);
		particles.push({
			x: p.x,
			y: p.y,
			originX: p.originX == null ? p.x : p.originX,
			originY: p.originY == null ? p.y : p.originY,
			prevX: p.x,
			prevY: p.y,
			vx: p.vx || 0,
			vy: p.vy || 0,
			ax: p.ax || 0,
			ay: p.ay || 0,
			drag: p.drag == null ? 0 : p.drag,
			life: p.life,
			maxLife: p.life,
			size: p.size * sizeScale,
			sizeEnd: (p.sizeEnd == null ? p.size : p.sizeEnd) * sizeScale,
			fadeIn: p.fadeIn || 0,
			color: p.color.slice(),
			colorEnd: (p.colorEnd || p.color).slice(),
			alpha: p.alpha == null ? 1 : p.alpha,
			alphaEnd: p.alphaEnd == null ? 0 : p.alphaEnd,
			gravityScale: p.gravityScale == null ? 1 : p.gravityScale,
			sprite: normalizedSpriteType,
			kind: p.kind || 'generic'
		});
	}

	function spawnSparklerLecture(dt, t) {
		const count = emissionCount(180, dt);
		const x = width * 0.5;
		const y = height * 0.58;
		for (let i = 0; i < count; i += 1) {
			const ang = randomRange(0, Math.PI * 2) + Math.sin(t * 10.0 + i * 0.18) * 0.16;
			const speed = randomRange(210, 440);
			spawnParticle({
				x,
				y,
				originX: x,
				originY: y,
				vx: Math.cos(ang) * speed + randomRange(-24, 24),
				vy: Math.sin(ang) * speed + randomRange(-18, 18),
				drag: 1.25,
				life: randomRange(0.55, 1.0),
				size: randomRange(42.0, 64.0),
				sizeEnd: randomRange(16.0, 24.0),
				color: [1.0, randomRange(0.82, 1.0), randomRange(0.24, 0.5)],
				colorEnd: [1.0, 0.35, 0.06],
				alpha: 0.98,
				alphaEnd: 0.0,
				gravityScale: 0,
				spriteType: SPRITE_BENG,
				kind: 'sparklerLecture'
			});
		}
	}

	function spawnSparkler(dt, t) {
		const count = emissionCount(340, dt);
		const x = width * 0.5;
		const y = height * 0.58;
		for (let i = 0; i < count; i += 1) {
			const ang = randomRange(0, Math.PI * 2) + Math.sin(t * 9.0 + i * 0.2) * 0.12;
			const speed = randomRange(180, 360);
			spawnParticle({
				x,
				y,
				vx: Math.cos(ang) * speed + randomRange(-30, 30),
				vy: Math.sin(ang) * speed,
				drag: 1.1,
				life: randomRange(1.0, 1.9),
				size: randomRange(6.8, 14.8),
				sizeEnd: 1.0,
				color: [1.0, randomRange(0.78, 0.96), randomRange(0.22, 0.45)],
				colorEnd: [1.0, 0.2, 0.05],
				alpha: 0.95,
				alphaEnd: 0.0,
				gravityScale: 0.48,
				spriteType: SPRITE_BENG,
				kind: 'sparkler'
			});
		}
	}

	function spawnSmoke(dt) {
		const count = emissionCount(130, dt);
		const x = width * 0.5;
		const y = height * 0.7;
		for (let i = 0; i < count; i += 1) {
			spawnParticle({
				x: x + randomRange(-16, 16),
				y: y + randomRange(-8, 8),
				vx: randomRange(-36, 36),
				vy: randomRange(-135, -40),
				drag: 0.56,
				life: randomRange(2.2, 4.2),
				size: randomRange(14, 22),
				sizeEnd: randomRange(46, 90),
				color: [0.62, 0.62, 0.62],
				colorEnd: [0.1, 0.1, 0.1],
				alpha: randomRange(0.24, 0.34),
				alphaEnd: 0.0,
				gravityScale: -0.16
			});
		}
	}

	function spawnRain(dt) {
		const count = emissionCount(1000, dt);
		for (let i = 0; i < count; i += 1) {
			spawnParticle({
				x: randomRange(0, width),
				y: randomRange(-40, -4),
				vx: randomRange(-22, 14),
				vy: randomRange(330, 580),
				drag: 0,
				life: randomRange(3.1, 5.2),
				size: randomRange(2.0, 3.3),
				sizeEnd: 1.4,
				color: [0.58, 0.76, 1.0],
				colorEnd: [0.45, 0.6, 0.9],
				alpha: randomRange(0.45, 0.66),
				alphaEnd: 0.06,
				gravityScale: 0
			});
		}
	}

	function spawnSnow(dt, t) {
		const count = emissionCount(260, dt);
		for (let i = 0; i < count; i += 1) {
			const y = randomRange(-20, -2);
			const wind = Math.sin(t * 0.7 + y * 0.04) * 35;
			spawnParticle({
				x: randomRange(0, width),
				y,
				vx: randomRange(-18, 18) + wind,
				vy: randomRange(70, 145),
				drag: 0.22,
				life: randomRange(6.5, 8.0),
				size: randomRange(3.2, 5.2),
				sizeEnd: randomRange(2.4, 4.2),
				color: [0.95, 0.98, 1.0],
				colorEnd: [0.86, 0.9, 0.95],
				alpha: randomRange(0.6, 0.85),
				alphaEnd: 0.15,
				gravityScale: 0.06,
				sizeScale: state.sizeScale * state.snowExtraScale,
				spriteType: SPRITE_SNOW
			});
		}
	}

	function spawnCloudsAndSteam(dt, t) {
		const cloudCount = emissionCount(100, dt);
		const cloudClusterX = randomRange(0.1, 0.9) * width;
		const clusterSpread = randomRange(width * 0.08, width * 0.22);
		for (let i = 0; i < cloudCount; i += 1) {
			const x = Math.random() < 0.7 ? randomRange(cloudClusterX - clusterSpread, cloudClusterX + clusterSpread) : randomRange(-20, width + 20);
			const y = randomRange(height * 0.06, height * 0.28);
			const speedTier = Math.random();
			const vx = speedTier < 0.35 ? randomRange(3, 11) : speedTier < 0.75 ? randomRange(10, 22) : randomRange(18, 34);
			spawnParticle({
				x,
				y,
				vx,
				vy: randomRange(-8, 8),
				drag: 0.16,
				life: randomRange(18.0, 25.0),
				size: randomRange(62, 95),
				sizeEnd: randomRange(120, 175),
				color: [0.38, 0.4, 0.45],
				colorEnd: [0.18, 0.2, 0.24],
				alpha: randomRange(0.2, 0.32),
				alphaEnd: 0,
				gravityScale: 0,
				fadeIn: randomRange(1.2, 2.3)
			});
		}

		const jets = 6;
		for (let j = 0; j < jets; j += 1) {
			const jetCount = emissionCount(24, dt);
			const x = ((j + 0.5) / jets) * width;
			for (let i = 0; i < jetCount; i += 1) {
				const wobble = Math.sin(t * 2.0 + j) * 12;
				spawnParticle({
					x: x + wobble + randomRange(-8, 8),
					y: height * 0.95 + randomRange(-3, 3),
					vx: randomRange(-28, 28),
					vy: randomRange(-190, -110),
					drag: 0.8,
					life: randomRange(1.3, 2.1),
					size: randomRange(9, 15),
					sizeEnd: randomRange(34, 56),
					color: [0.82, 0.85, 0.89],
					colorEnd: [0.38, 0.42, 0.48],
					alpha: randomRange(0.28, 0.45),
					alphaEnd: 0,
					gravityScale: -0.1,
					fadeIn: randomRange(0.4, 0.8)
				});
			}
		}
	}

	function createRocket() {
		rockets.push({
			x: randomRange(width * 0.15, width * 0.85),
			y: height + 12,
			vx: randomRange(-45, 45),
			vy: randomRange(-680, -540),
			targetY: randomRange(height * 0.16, height * 0.48),
			color: [randomRange(0.6, 1.0), randomRange(0.4, 1.0), randomRange(0.35, 1.0)],
			type: Math.floor(randomRange(0, 4))
		});
	}

	function explodeFirework(x, y, baseColor, type) {
		const burstCount = [110, 140, 170, 130][type] || 120;

		for (let i = 0; i < burstCount; i++) {
			let ang = randomRange(0, Math.PI * 2);
			let speed = randomRange(90, 430);

			if (type === 1) {
				speed = randomRange(260, 330) * randomRange(0.94, 1.06);
			} else if (type === 2) {
				ang = (Math.PI * 2 * i) / burstCount + randomRange(-0.05, 0.05);
				speed = randomRange(180, 360);
			} else if (type === 3) {
				const petals = 6;
				speed = randomRange(170, 340) * (0.45 + 0.55 * Math.sin(ang * petals));
			}

			const cJitter = 0.18;
			spawnParticle({
				x,
				y,
				vx: Math.cos(ang) * speed,
				vy: Math.sin(ang) * speed,
				drag: 1.18,
				life: randomRange(1.0, 2.2),
				size: randomRange(2.4, 5.2),
				sizeEnd: 0.7,
				color: [
					Math.min(1, baseColor[0] + randomRange(-cJitter, cJitter)),
					Math.min(1, baseColor[1] + randomRange(-cJitter, cJitter)),
					Math.min(1, baseColor[2] + randomRange(-cJitter, cJitter))
				],
				colorEnd: [0.1, 0.04, 0.02],
				alpha: 1,
				alphaEnd: 0,
				gravityScale: 0.7
			});
		}

		for (let i = 0; i < 34; i += 1) {
			const ang = randomRange(0, Math.PI * 2);
			const speed = randomRange(30, 72);
			spawnParticle({
				x,
				y,
				vx: Math.cos(ang) * speed,
				vy: Math.sin(ang) * speed,
				drag: 0.6,
				life: randomRange(1.5, 2.5),
				size: randomRange(12, 18),
				sizeEnd: randomRange(30, 54),
				color: [0.35, 0.35, 0.4],
				colorEnd: [0.05, 0.05, 0.06],
				alpha: randomRange(0.15, 0.22),
				alphaEnd: 0,
				gravityScale: -0.05
			});
		}
	}

	function spawnFireworks(dt) {
		state.fireworkTimer -= dt;
		if (state.fireworkTimer <= 0) {
			createRocket();
			if (Math.random() > 0.55) {
				createRocket();
			}
			state.fireworkTimer = randomRange(0.9, 1.7);
		}

		for (let i = rockets.length - 1; i >= 0; i -= 1) {
			const r = rockets[i];
			r.x += r.vx * dt;
			r.y += r.vy * dt;
			r.vy += gravity * 0.34 * dt;

			spawnParticle({
				x: r.x,
				y: r.y,
				vx: randomRange(-12, 12),
				vy: randomRange(36, 92),
				drag: 2.4,
				life: randomRange(0.2, 0.4),
				size: randomRange(2.2, 3.2),
				sizeEnd: 0.7,
				color: [1, 0.78, 0.3],
				colorEnd: [1, 0.2, 0.05],
				alpha: 0.9,
				alphaEnd: 0,
				gravityScale: 0.3
			});

			if (r.vy >= -20 || r.y <= r.targetY) {
				explodeFirework(r.x, r.y, r.color, r.type);
				rockets.splice(i, 1);
			}
		}
	}

	// Цвет звезды по нормированному радиусу (0 — центр, 1 — край).
	// Имитирует физику: горячее ядро (бело-жёлтое) → холодные молодые звёзды на краях (голубой/фиолетовый).
	function galaxyStarColor(rNorm) {
		const stops = [
			[0.0,  [1.00, 0.95, 0.78]],   // ярко-жёлтое ядро
			[0.25, [1.00, 0.82, 0.55]],   // оранжевое
			[0.55, [0.92, 0.74, 1.00]],   // розово-сиреневое
			[0.80, [0.55, 0.72, 1.00]],   // голубое
			[1.00, [0.45, 0.55, 1.00]]    // глубокий синий
		];
		for (let i = 0; i < stops.length - 1; i += 1) {
			const left = stops[i];
			const right = stops[i + 1];
			if (rNorm >= left[0] && rNorm <= right[0]) {
				const k = (rNorm - left[0]) / (right[0] - left[0]);
				return [
					lerp(left[1][0], right[1][0], k),
					lerp(left[1][1], right[1][1], k),
					lerp(left[1][2], right[1][2], k)
				];
			}
		}
		return [1, 1, 1];
	}

	function spawnGalaxy(dt, t) {
		const cx = width * 0.5;
		const cy = height * 0.5;
		const rMax = Math.min(width, height) * 0.42;

		// === ФОНОВЫЕ ЗВЁЗДЫ === — мерцающие точки по всему экрану для глубины
		const bgCount = emissionCount(180, dt);
		for (let i = 0; i < bgCount; i += 1) {
			const x = randomRange(0, width);
			const y = randomRange(0, height);
			// расстояние от центра галактики — фоновые звёзды реже у самой галактики
			const dx = x - cx;
			const dy = (y - cy) / 0.55;
			const distFromGalaxy = Math.hypot(dx, dy);
			if (distFromGalaxy < rMax * 0.7 && Math.random() < 0.55) {
				continue;
			}
			const tint = Math.random();
			let color;
			if (tint < 0.7)       color = [1.0, 1.0, 1.0];                              // белая
			else if (tint < 0.85) color = [0.7, 0.8, 1.0];                              // голубоватая
			else if (tint < 0.95) color = [1.0, 0.85, 0.7];                             // тёплая
			else                  color = [1.0, 0.6, 0.5];                              // красноватая
			const peakAlpha = randomRange(0.35, 0.95);
			spawnParticle({
				x, y,
				vx: 0, vy: 0,
				drag: 0,
				life: randomRange(1.6, 3.4),                  // короткая жизнь → мерцание (рождение/смерть)
				size: randomRange(1.4, 3.2),
				sizeEnd: randomRange(1.0, 2.0),
				color,
				colorEnd: color,
				alpha: peakAlpha,
				alphaEnd: 0,
				gravityScale: 0,
				fadeIn: randomRange(0.4, 1.0)                 // плавное появление → видимое «мигание»
			});
		}
		const armCount = 3;
		const twist = 3.2;             // насколько туго закручены рукава (рад/нормированный радиус)
		const omega = 0.18;            // угловая скорость глобального вращения (рад/сек)
		const armSharpness = 22.0;     // насколько чётко выделены рукава
		const armScatter = 0.22;       // как сильно звёзды могут отклоняться поперёк рукава

		// === ЯДРО ГАЛАКТИКИ === — плотное яркое скопление в центре
		const coreCount = emissionCount(120, dt);
		for (let i = 0; i < coreCount; i += 1) {
			const r = Math.pow(Math.random(), 2.4) * rMax * 0.18;
			const theta = randomRange(0, Math.PI * 2);
			const x = cx + Math.cos(theta) * r;
			const y = cy + Math.sin(theta) * r;
			const rNorm = r / rMax;
			const color = galaxyStarColor(rNorm * 0.5);
			spawnParticle({
				x, y,
				vx: -Math.sin(theta) * 14,
				vy:  Math.cos(theta) * 14,
				drag: 0.05,
				life: randomRange(4.0, 7.0),
				size: randomRange(8, 16),
				sizeEnd: randomRange(2, 5),
				color: [Math.min(1, color[0] + 0.2), Math.min(1, color[1] + 0.15), color[2]],
				colorEnd: color,
				alpha: randomRange(0.55, 0.85),
				alphaEnd: 0,
				gravityScale: 0,
				fadeIn: randomRange(0.3, 0.7)
			});
		}

		// === РУКАВА === — звёзды на логарифмической спирали
		const armCountPerFrame = emissionCount(620, dt);
		for (let i = 0; i < armCountPerFrame; i += 1) {
			// концентрация плотности к центру: pow(u, 1.6) → больше точек в середине
			const u = Math.pow(Math.random(), 0.55);
			const r = u * rMax;
			const rNorm = r / rMax;

			// привязка к ближайшему рукаву через «потенциал» sin(armCount·θ + twist·r)²
			const baseTheta = randomRange(0, Math.PI * 2);
			const armPhase = (baseTheta - rNorm * twist) * armCount;
			const armPull = Math.cos(armPhase);                 // +1 на гребне рукава, -1 во впадине
			const inArm = (armPull + 1) * 0.5;                  // 0..1
			// плотность в рукавах: повторно сэмплируем, если попали во впадину
			if (Math.random() > Math.pow(inArm, armSharpness * 0.05)) {
				continue;
			}

			// небольшое поперечное «размывание» вокруг рукава
			const lateral = (Math.random() - 0.5) * armScatter * (0.4 + rNorm);
			const theta = baseTheta + lateral + t * omega;

			const x = cx + Math.cos(theta) * r;
			const y = cy + Math.sin(theta) * r * 0.55;          // сплюснутый диск (наклон ~57°)

			// касательная скорость — иллюзия орбитального движения
			const orbitalSpeed = 14 + 28 * Math.sqrt(rNorm + 0.01);
			const vx = -Math.sin(theta) * orbitalSpeed;
			const vy =  Math.cos(theta) * orbitalSpeed * 0.55;

			const color = galaxyStarColor(rNorm);
			spawnParticle({
				x, y,
				vx, vy,
				drag: 0.04,
				life: randomRange(5.5, 9.5),
				size: randomRange(2.4, 5.5) * (1 + (1 - rNorm) * 0.6),
				sizeEnd: randomRange(1.0, 2.4),
				color,
				colorEnd: [color[0] * 0.4, color[1] * 0.4, color[2] * 0.6],
				alpha: randomRange(0.55, 0.95),
				alphaEnd: 0,
				gravityScale: 0,
				fadeIn: randomRange(0.6, 1.4)
			});
		}

		// === ТУМАННОСТЬ === — крупные мягкие облака пыли вдоль рукавов
		const dustCount = emissionCount(45, dt);
		for (let i = 0; i < dustCount; i += 1) {
			const u = Math.pow(Math.random(), 0.8);
			const r = u * rMax * 0.95;
			const rNorm = r / rMax;
			const baseTheta = randomRange(0, Math.PI * 2);
			const theta = baseTheta + t * omega + (Math.random() - 0.5) * 0.4;
			const x = cx + Math.cos(theta) * r;
			const y = cy + Math.sin(theta) * r * 0.55;
			const color = galaxyStarColor(Math.min(1, rNorm + 0.2));
			spawnParticle({
				x, y,
				vx: -Math.sin(theta) * 6,
				vy:  Math.cos(theta) * 6 * 0.55,
				drag: 0.02,
				life: randomRange(8.0, 14.0),
				size: randomRange(40, 75),
				sizeEnd: randomRange(70, 130),
				color: [color[0] * 0.55, color[1] * 0.55, color[2] * 0.85],
				colorEnd: [color[0] * 0.12, color[1] * 0.12, color[2] * 0.25],
				alpha: randomRange(0.07, 0.13),
				alphaEnd: 0,
				gravityScale: 0,
				fadeIn: randomRange(1.5, 2.8)
			});
		}
	}

	const positions = new Float32Array(state.maxParticles * 2);
	const sizes = new Float32Array(state.maxParticles);
	const colors = new Float32Array(state.maxParticles * 4);
	const sprites = new Float32Array(state.maxParticles);
	const trailPositions = new Float32Array(state.maxParticles * 4);
	const trailColors = new Float32Array(state.maxParticles * 6);

	function updateParticles(dt) {
		for (let i = particles.length - 1; i >= 0; i -= 1) {
			const p = particles[i];
			const prevX = p.x;
			const prevY = p.y;
			p.life -= dt;

			if (p.life <= 0) {
				particles.splice(i, 1);
				continue;
			}

			const dragFactor = Math.max(0, 1 - p.drag * dt);
			p.vx *= dragFactor;
			p.vy *= dragFactor;

			p.vx += p.ax * dt;
			p.vy += (p.ay + gravity * p.gravityScale) * dt;

			p.prevX = prevX;
			p.prevY = prevY;
			p.x += p.vx * dt;
			p.y += p.vy * dt;

			if (p.kind === 'sparkler' && Math.random() < 0.86) {
				spawnParticle({
					x: prevX,
					y: prevY,
					vx: p.vx * 0.04 + randomRange(-8, 8),
					vy: p.vy * 0.04 + randomRange(-8, 8),
					drag: 2.5,
					life: randomRange(0.14, 0.28),
					size: randomRange(2.6, 4.6),
					sizeEnd: 0.4,
					color: [1.0, 0.74, 0.28],
					colorEnd: [1.0, 0.2, 0.03],
					alpha: 0.55,
					alphaEnd: 0,
					gravityScale: 0.35,
					spriteType: SPRITE_NONE,
					kind: 'sparklerTrail'
				});
			}
		}

		if (particles.length > state.maxParticles) {
			particles.splice(0, particles.length - state.maxParticles);
		}
	}

	function fillTrailBuffers() {
		let vertexCount = 0;
		for (let i = 0; i < particles.length && vertexCount + 2 <= state.maxParticles * 2; i += 1) {
			const p = particles[i];
			if (p.kind !== 'sparklerLecture') {
				continue;
			}

			const t = 1 - p.life / p.maxLife;
			const r = 1.0;
			const g = 0.95;
			const b = 0.78;

			const posBase = vertexCount * 2;
			const colBase = vertexCount * 3;

			trailPositions[posBase] = p.originX;
			trailPositions[posBase + 1] = p.originY;
			trailPositions[posBase + 2] = p.x;
			trailPositions[posBase + 3] = p.y;

			trailColors[colBase] = r;
			trailColors[colBase + 1] = g;
			trailColors[colBase + 2] = b;
			trailColors[colBase + 3] = r;
			trailColors[colBase + 4] = g;
			trailColors[colBase + 5] = b;

			vertexCount += 2;
		}

		return vertexCount;
	}

	function fillBuffers() {
		const count = Math.min(particles.length, state.maxParticles);
		for (let i = 0; i < count; i += 1) {
			const p = particles[i];
			const life01 = 1 - p.life / p.maxLife;
			const t = Math.min(1, Math.max(0, life01));

			let alpha = lerp(p.alpha, p.alphaEnd, t);
			if (p.kind === 'sparklerLecture') {
				alpha = p.alpha;
			}
			if (p.fadeIn > 0 && p.life > p.maxLife - p.fadeIn) {
				alpha *= (p.maxLife - p.life) / p.fadeIn;
			}

			positions[i * 2] = p.x;
			positions[i * 2 + 1] = p.y;
			sizes[i] = lerp(p.size, p.sizeEnd, t);
			if (p.kind === 'sparklerLecture') {
				colors[i * 4] = p.color[0];
				colors[i * 4 + 1] = p.color[1];
				colors[i * 4 + 2] = p.color[2];
			} else {
				colors[i * 4] = lerp(p.color[0], p.colorEnd[0], t);
				colors[i * 4 + 1] = lerp(p.color[1], p.colorEnd[1], t);
				colors[i * 4 + 2] = lerp(p.color[2], p.colorEnd[2], t);
			}
			colors[i * 4 + 3] = alpha;
			sprites[i] = p.sprite;
		}
		return count;
	}

	function draw(count, trailVertexCount) {
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		if (trailVertexCount > 0) {
			gl.useProgram(trailProgram);
			gl.uniform2f(trailLoc.resolution, width, height);
			gl.lineWidth(1.5);

			gl.bindBuffer(gl.ARRAY_BUFFER, trailPositionBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, trailPositions.subarray(0, trailVertexCount * 2), gl.DYNAMIC_DRAW);
			gl.enableVertexAttribArray(trailLoc.position);
			gl.vertexAttribPointer(trailLoc.position, 2, gl.FLOAT, false, 0, 0);

			gl.bindBuffer(gl.ARRAY_BUFFER, trailColorBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, trailColors.subarray(0, trailVertexCount * 3), gl.DYNAMIC_DRAW);
			gl.enableVertexAttribArray(trailLoc.color);
			gl.vertexAttribPointer(trailLoc.color, 3, gl.FLOAT, false, 0, 0);

			gl.drawArrays(gl.LINES, 0, trailVertexCount);
		}

		gl.useProgram(particleProgram);
		gl.uniform2f(loc.resolution, width, height);
		gl.uniform1f(loc.bengReady, sparklerTextureReady ? 1 : 0);
		gl.uniform1f(loc.snowReady, snowTextureReady ? 1 : 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, sparklerTexture);
		gl.uniform1i(loc.bengTexture, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, snowTexture);
		gl.uniform1i(loc.snowTexture, 1);

		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, count * 2), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(loc.position);
		gl.vertexAttribPointer(loc.position, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, sizes.subarray(0, count), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(loc.size);
		gl.vertexAttribPointer(loc.size, 1, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, colors.subarray(0, count * 4), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(loc.color);
		gl.vertexAttribPointer(loc.color, 4, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, sprites.subarray(0, count), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(loc.sprite);
		gl.vertexAttribPointer(loc.sprite, 1, gl.FLOAT, false, 0, 0);

		gl.drawArrays(gl.POINTS, 0, count);
	}

	function spawnByMode(dt, time) {
		if (state.mode === 1) {
			spawnSparkler(dt, time);
			return;
		}
		if (state.mode === 8) {
			spawnSparklerLecture(dt, time);
			return;
		}
		if (state.mode === 2) {
			spawnSmoke(dt);
			return;
		}
		if (state.mode === 3) {
			spawnRain(dt);
			return;
		}
		if (state.mode === 4) {
			spawnCloudsAndSteam(dt, time);
			return;
		}
		if (state.mode === 5) {
			spawnFireworks(dt);
			return;
		}
		if (state.mode === 6) {
			spawnGalaxy(dt, time);
			return;
		}
		if (state.mode === 7) {
			spawnSnow(dt, time);
		}
	}

	let lastTime = performance.now();
	setMode(1);

	function frame(now) {
		resize();

		const dt = Math.min(0.033, (now - lastTime) * 0.001);
		lastTime = now;
		state.time += dt;

		spawnByMode(dt, state.time);
		updateParticles(dt);
		const count = fillBuffers();
		const trailVertexCount = state.mode === 8 ? fillTrailBuffers() : 0;
		draw(count, trailVertexCount);

		requestAnimationFrame(frame);
	}

	requestAnimationFrame(frame);
})();
