const canvas = document.querySelector('#scene');
const ctx = canvas.getContext('2d');
const population = document.querySelector('#population');
const toggle = document.querySelector('#toggle');
const microphoneButton = document.querySelector('#microphone');
const microphoneStatus = document.querySelector('#mic-status');

let width = 0;
let height = 0;
let pixelRatio = 1;
let running = true;
let lastTime = performance.now();
let frameTime = lastTime;
const people = [];
const LIMITED_DIRECTION_TEST = true;
const CONNECTION_DISTANCE = 155;

let microphoneActive = false;
let audioContext = null;
let analyser = null;
let microphoneStream = null;
let audioSamples = null;
let smoothedLevel = 0;
let noiseFloor = 0.012;
let lastGlitchPulse = 0;
let lastMicLabelUpdate = 0;

// 공간 좌표: 사람은 X–Z 바닥(y=0) 위에서만 움직인다.
const WORLD = { minX: -86, maxX: 86, minZ: -58, maxZ: 58 };
const CAMERA = {
  // 정면 중앙이 아닌 오른쪽 위에서 바라봐 공간의 흐름에 살짝 사선을 만든다.
  position: { x: 52, y: 132, z: 108 },
  target: { x: -4, y: 0, z: 2 },
  focalLength: 760,
};

const palette = ['#276078', '#c65347', '#d69b45', '#45513f', '#7a5269', '#343a40'];
const random = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// person_1.svg 안의 8개 완성 자세를 메인 군중의 걷기 프레임으로 사용한다.
const rightToLeftSheet = new Image();
const leftToRightSheet = new Image();
const bottomRightToTopLeftSheet = new Image();
const bottomLeftToTopRightSheet = new Image();
let rightToLeftReady = false;
let leftToRightReady = false;
let bottomRightToTopLeftReady = false;
let bottomLeftToTopRightReady = false;
rightToLeftSheet.src = './person_1.svg';
leftToRightSheet.src = './person_2.svg';
bottomRightToTopLeftSheet.src = './person_3.svg';
bottomLeftToTopRightSheet.src = './person_4.svg';
rightToLeftSheet.addEventListener('load', () => { rightToLeftReady = true; });
leftToRightSheet.addEventListener('load', () => { leftToRightReady = true; });
bottomRightToTopLeftSheet.addEventListener('load', () => { bottomRightToTopLeftReady = true; });
bottomLeftToTopRightSheet.addEventListener('load', () => { bottomLeftToTopRightReady = true; });
const characterSourceHeight = 242.74;
const characterPoses = [
  { x: 0, width: 101 },
  { x: 322, width: 96 },
  { x: 643, width: 96 },
  { x: 972, width: 84 },
  { x: 1293, width: 74 },
  { x: 1600, width: 106 },
  { x: 1910, width: 116 },
  { x: 2250, width: 95 },
];
const characterFrameSequence = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
const character3SourceHeight = 207.12;
const character3Poses = [
  { x: 0, width: 95, anchor: 0.3325, bottom: 206.40 },
  { x: 327, width: 102, anchor: 0.4563, bottom: 204.19 },
  { x: 650, width: 106, anchor: 0.4807, bottom: 206.37 },
  { x: 975, width: 106, anchor: 0.5035, bottom: 206.40 },
  { x: 1305, width: 106, anchor: 0.4792, bottom: 205.31 },
  { x: 1631, width: 106, anchor: 0.4926, bottom: 206.05 },
  { x: 1958, width: 106, anchor: 0.4965, bottom: 206.63 },
  { x: 2285, width: 106, anchor: 0.5005, bottom: 205.65 },
  { x: 2612, width: 106, anchor: 0.5047, bottom: 205.88 },
  { x: 2940, width: 106, anchor: 0.4992, bottom: 206.37 },
  { x: 3267, width: 106, anchor: 0.5033, bottom: 207.11 },
  { x: 3594, width: 78, anchor: 0.6894, bottom: 206.40 },
];
const character3FrameSequence = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const character4Poses = [
  { x: 3577.69, width: 95, anchor: 0.6675, bottom: 206.40 },
  { x: 3243.69, width: 102, anchor: 0.5437, bottom: 204.19 },
  { x: 2916.69, width: 106, anchor: 0.5193, bottom: 206.37 },
  { x: 2591.69, width: 106, anchor: 0.4965, bottom: 206.40 },
  { x: 2261.69, width: 106, anchor: 0.5208, bottom: 205.31 },
  { x: 1935.69, width: 106, anchor: 0.5074, bottom: 206.05 },
  { x: 1608.69, width: 106, anchor: 0.5035, bottom: 206.63 },
  { x: 1281.69, width: 106, anchor: 0.4995, bottom: 205.65 },
  { x: 954.69, width: 106, anchor: 0.4953, bottom: 205.88 },
  { x: 626.69, width: 106, anchor: 0.5008, bottom: 206.37 },
  { x: 299.69, width: 106, anchor: 0.4967, bottom: 207.11 },
  { x: 0.69, width: 78, anchor: 0.3106, bottom: 206.40 },
];

function normalize(v) {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

function cameraBasis() {
  const forward = normalize({
    x: CAMERA.target.x - CAMERA.position.x,
    y: CAMERA.target.y - CAMERA.position.y,
    z: CAMERA.target.z - CAMERA.position.z,
  });
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  return { forward, right, up };
}

function project(x, y, z) {
  const basis = cameraBasis();
  const relative = { x: x - CAMERA.position.x, y: y - CAMERA.position.y, z: z - CAMERA.position.z };
  const depth = dot(relative, basis.forward);
  const scale = CAMERA.focalLength / Math.max(depth, 1);
  return {
    x: width / 2 + dot(relative, basis.right) * scale,
    y: height * 0.47 - dot(relative, basis.up) * scale,
    scale,
    depth,
  };
}

function resize() {
  pixelRatio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  CAMERA.focalLength = Math.min(width, height) * 1.24;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

class Person {
  constructor() {
    this.x = random(WORLD.minX + 4, WORLD.maxX - 4);
    this.y = 0;
    this.z = random(WORLD.minZ + 4, WORLD.maxZ - 4);
    this.speed = random(5.2, 8.2);
    // 0: 우상→좌하, 1: 좌상→우하, 2: 우하→좌상, 3: 좌하→우상
    this.flowType = Math.floor(Math.random() * 4);
    this.horizontalDirection = this.flowType === 1 || this.flowType === 3 ? 1 : -1;
    this.verticalDirection = this.flowType >= 2 ? -1 : 1;
    const angle = random(0, Math.PI * 2);
    this.vx = Math.cos(angle) * this.speed;
    this.vz = Math.sin(angle) * this.speed;
    this.height = random(5.7, 6.6);
    this.glitchUntil = 0;
    this.glitchCooldownUntil = 0;
    this.glitchStrength = 0;
    this.glitchSeed = random(0, 1000);
    this.glitchFrameJump = 0;
    this.color = palette[Math.floor(Math.random() * palette.length)];
    this.stride = random(0, Math.PI * 2);
    this.pause = 0;
    this.chooseDestination();
  }

  chooseDestination() {
    this.tx = random(WORLD.minX + 5, WORLD.maxX - 5);
    this.tz = random(WORLD.minZ + 5, WORLD.maxZ - 5);
  }

  update(dt) {
    if (LIMITED_DIRECTION_TEST) {
      const basis = cameraBasis();
      const laneX = -basis.right.z;
      const laneZ = basis.right.x;

      // 화면 투영 결과가 실제로 아래쪽 15도가 되도록 바닥 방향을 보정한다.
      const screenHere = project(this.x, 0, this.z);
      const screenRight = project(this.x + basis.right.x, 0, this.z + basis.right.z);
      const laneProbe = project(this.x + laneX, 0, this.z + laneZ);
      const downSign = laneProbe.y >= screenHere.y ? 1 : -1;
      const horizontalPixels = Math.abs(screenRight.x - screenHere.x) || 1;
      const verticalPixels = Math.abs(laneProbe.y - screenHere.y) || 1;
      const laneWeight = Math.tan(15 * Math.PI / 180) * horizontalPixels / verticalPixels;
      const verticalSign = downSign * this.verticalDirection;
      const rawDirectionX = basis.right.x * this.horizontalDirection + laneX * verticalSign * laneWeight;
      const rawDirectionZ = basis.right.z * this.horizontalDirection + laneZ * verticalSign * laneWeight;
      const directionLength = Math.hypot(rawDirectionX, rawDirectionZ) || 1;
      const directionX = rawDirectionX / directionLength;
      const directionZ = rawDirectionZ / directionLength;
      let desiredX = directionX * this.speed;
      let desiredZ = directionZ * this.speed;

      // 같은 방향으로 걷더라도 서로 포개지지 않도록 간격은 계속 유지한다.
      for (const other of people) {
        if (other === this) continue;
        const ox = this.x - other.x;
        const oz = this.z - other.z;
        const d2 = ox * ox + oz * oz;
        if (d2 > 0 && d2 < 5.2 * 5.2) {
          const d = Math.sqrt(d2);
          const force = (5.2 - d) / 5.2;
          desiredX += (ox / d) * force * 6;
          desiredZ += (oz / d) * force * 6;
        }
      }

      const steering = 2.2;
      this.vx += (desiredX - this.vx) * Math.min(1, steering * dt);
      this.vz += (desiredZ - this.vz) * Math.min(1, steering * dt);
      const velocity = Math.hypot(this.vx, this.vz);
      const maxSpeed = this.speed * 1.18;
      if (velocity > maxSpeed) {
        this.vx = (this.vx / velocity) * maxSpeed;
        this.vz = (this.vz / velocity) * maxSpeed;
      }

      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.stride += velocity * dt * 1.15;

      // 카메라의 가로축을 기준으로 왼쪽 끝에서 오른쪽 끝으로 순환한다.
      let travel = this.x * basis.right.x + this.z * basis.right.z;
      let lanePosition = this.x * laneX + this.z * laneZ;
      const passedSide = this.horizontalDirection < 0 ? travel < -96 : travel > 96;
      const passedVertical = this.verticalDirection > 0
        ? lanePosition * downSign > 60
        : lanePosition * downSign < -60;
      if (passedSide) travel = this.horizontalDirection < 0 ? 96 : -96;
      if (passedVertical) lanePosition = -downSign * this.verticalDirection * 60;

      if (passedSide || passedVertical) {
        this.x = basis.right.x * travel + laneX * lanePosition;
        this.z = basis.right.z * travel + laneZ * lanePosition;
        this.vx = directionX * this.speed;
        this.vz = directionZ * this.speed;
      }
      return;
    }

    if (this.pause > 0) {
      this.pause -= dt;
      this.vx *= Math.pow(0.025, dt);
      this.vz *= Math.pow(0.025, dt);
      return;
    }

    let dx = this.tx - this.x;
    let dz = this.tz - this.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 2.2) {
      if (Math.random() < 0.2) this.pause = random(0.4, 1.4);
      this.chooseDestination();
      dx = this.tx - this.x;
      dz = this.tz - this.z;
      distance = Math.hypot(dx, dz);
    }

    const arrival = clamp(distance / 10, 0.25, 1);
    let desiredX = (dx / distance) * this.speed * arrival;
    let desiredZ = (dz / distance) * this.speed * arrival;

    // 같은 바닥 위의 사람끼리만 거리를 계산한다.
    for (const other of people) {
      if (other === this) continue;
      const ox = this.x - other.x;
      const oz = this.z - other.z;
      const d2 = ox * ox + oz * oz;
      if (d2 > 0 && d2 < 5.2 * 5.2) {
        const d = Math.sqrt(d2);
        const force = (5.2 - d) / 5.2;
        desiredX += (ox / d) * force * 7;
        desiredZ += (oz / d) * force * 7;
      }
    }

    const steering = 2.25;
    this.vx += (desiredX - this.vx) * Math.min(1, steering * dt);
    this.vz += (desiredZ - this.vz) * Math.min(1, steering * dt);
    const velocity = Math.hypot(this.vx, this.vz);
    const maxSpeed = this.speed * 1.25;
    if (velocity > maxSpeed) {
      this.vx = (this.vx / velocity) * maxSpeed;
      this.vz = (this.vz / velocity) * maxSpeed;
    }

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.stride += velocity * dt * 1.15;

    const margin = 2;
    if (this.x < WORLD.minX + margin || this.x > WORLD.maxX - margin ||
        this.z < WORLD.minZ + margin || this.z > WORLD.maxZ - margin) {
      this.x = clamp(this.x, WORLD.minX + margin, WORLD.maxX - margin);
      this.z = clamp(this.z, WORLD.minZ + margin, WORLD.maxZ - margin);
      this.chooseDestination();
    }
  }

  draw() {
    const foot = project(this.x, 0, this.z);
    const head = project(this.x, this.height, this.z);
    const bodyHeight = Math.max(9, foot.y - head.y);
    const bodyWidth = Math.max(2.2, bodyHeight * 0.22);
    const velocity = Math.hypot(this.vx, this.vz);
    const moving = Math.min(1, velocity / 3);

    // 발밑 그림자는 언제나 y=0인 바닥에 붙는다.
    const shadowFacing = this.horizontalDirection < 0 ? 1 : -1;
    const shadowYOffset = this.verticalDirection > 0 ? -0.06 : 0.16;
    ctx.save();
    ctx.translate(foot.x + bodyWidth * .35 * shadowFacing, foot.y + bodyWidth * shadowYOffset);
    ctx.rotate(0.28 * this.horizontalDirection * this.verticalDirection);
    ctx.fillStyle = 'rgba(35, 31, 25, .045)';
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyWidth * 2.2, bodyWidth * .72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(35, 31, 25, .10)';
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyWidth * 1.55, bodyWidth * .42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    let activeSheet;
    let activeSheetReady;
    let activePoses;
    let activeSequence;
    let activeSourceHeight;
    if (this.flowType === 0) {
      activeSheet = rightToLeftSheet;
      activeSheetReady = rightToLeftReady;
      activePoses = characterPoses;
      activeSequence = characterFrameSequence;
      activeSourceHeight = characterSourceHeight;
    } else if (this.flowType === 1) {
      activeSheet = leftToRightSheet;
      activeSheetReady = leftToRightReady;
      activePoses = characterPoses;
      activeSequence = characterFrameSequence;
      activeSourceHeight = characterSourceHeight;
    } else if (this.flowType === 2) {
      activeSheet = bottomRightToTopLeftSheet;
      activeSheetReady = bottomRightToTopLeftReady;
      activePoses = character3Poses;
      activeSequence = character3FrameSequence;
      activeSourceHeight = character3SourceHeight;
    } else {
      activeSheet = bottomLeftToTopRightSheet;
      activeSheetReady = bottomLeftToTopRightReady;
      activePoses = character4Poses;
      activeSequence = character3FrameSequence;
      activeSourceHeight = character3SourceHeight;
    }
    if (activeSheetReady) {
      // 시간이 아니라 각 사람의 실제 보행 위상에 프레임을 연결한다.
      const glitching = frameTime < this.glitchUntil;
      const sequenceIndex = Math.floor((this.stride / (Math.PI * 2)) * activeSequence.length)
        + (glitching ? this.glitchFrameJump : 0);
      const frameIndex = activeSequence[((sequenceIndex % activeSequence.length) + activeSequence.length) % activeSequence.length];
      const pose = activePoses[frameIndex];
      const bob = Math.abs(Math.sin(this.stride)) * bodyHeight * 0.025 * moving;
      const spriteHeight = bodyHeight * 1.14;
      const spriteWidth = spriteHeight * (pose.width / activeSourceHeight);
      const anchor = pose.anchor ?? 0.5;
      const sourceBottom = pose.bottom ?? activeSourceHeight;
      const drawX = -spriteWidth * anchor;
      const drawY = -spriteHeight * (sourceBottom / activeSourceHeight);

      ctx.save();
      const jitterX = glitching ? Math.sin(frameTime * 0.13 + this.glitchSeed) * bodyWidth * this.glitchStrength : 0;
      const jitterY = glitching ? Math.cos(frameTime * 0.17 + this.glitchSeed) * bodyWidth * 0.35 : 0;
      ctx.translate(foot.x + jitterX, foot.y - bob + jitterY);

      const drawSprite = (offsetX = 0, offsetY = 0, alpha = 0.96) => {
        ctx.globalAlpha = alpha;
        ctx.drawImage(
          activeSheet,
          pose.x, 0, pose.width, activeSourceHeight,
          drawX + offsetX, drawY + offsetY, spriteWidth, spriteHeight,
        );
      };

      if (!glitching) {
        drawSprite(0, 0, this.pause > 0 ? 0.84 : 0.96);
      } else {
        drawSprite(0, 0, 0.58);
        const slices = 4 + Math.floor(this.glitchStrength * 4);
        for (let i = 0; i < slices; i++) {
          const phase = Math.sin(this.glitchSeed * (i + 1) + frameTime * 0.045);
          const stripX = drawX + (i / slices) * spriteWidth;
          const stripWidth = Math.max(0.65, spriteWidth / (slices * 1.55));
          const offsetX = phase * bodyWidth * (0.35 + this.glitchStrength * 0.7);
          const offsetY = Math.cos(this.glitchSeed + i * 2.4 + frameTime * 0.055)
            * bodyWidth * (0.6 + this.glitchStrength * 1.1);
          ctx.save();
          ctx.beginPath();
          ctx.rect(stripX, drawY, stripWidth, spriteHeight);
          ctx.clip();
          drawSprite(offsetX, offsetY, 0.96);
          ctx.restore();
        }
      }
      ctx.restore();
      return;
    }

    const hipY = foot.y - bodyHeight * 0.38;
    const shoulderY = foot.y - bodyHeight * 0.72;
    const stride = Math.sin(this.stride) * bodyWidth * 0.95 * moving;

    ctx.strokeStyle = '#34322e';
    ctx.lineWidth = Math.max(1, bodyWidth * .26);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(foot.x, hipY);
    ctx.lineTo(foot.x - bodyWidth * .42 + stride, foot.y);
    ctx.moveTo(foot.x, hipY);
    ctx.lineTo(foot.x + bodyWidth * .42 - stride, foot.y);
    ctx.stroke();

    ctx.strokeStyle = this.color;
    ctx.lineWidth = bodyWidth * 1.35;
    ctx.beginPath();
    ctx.moveTo(foot.x, hipY);
    ctx.lineTo(head.x, shoulderY);
    ctx.stroke();

    ctx.fillStyle = '#e3b18e';
    ctx.beginPath();
    ctx.arc(head.x, head.y + bodyWidth * .55, bodyWidth * .72, 0, Math.PI * 2);
    ctx.fill();
  }
}

function setPopulation(count) {
  while (people.length < count) people.push(new Person());
  if (people.length > count) people.splice(count);
}

function drawSpace() {
  // 외곽선이나 격자 없이 화면 전체를 하나의 열린 바닥으로 사용한다.
  ctx.fillStyle = '#f5f3ef';
  ctx.fillRect(0, 0, width, height);
}

function drawFootConnections() {
  const feet = people.map(person => project(person.x, 0, person.z));
  ctx.save();
  ctx.lineWidth = 1;

  for (let i = 0; i < feet.length; i++) {
    for (let j = i + 1; j < feet.length; j++) {
      const dx = feet[j].x - feet[i].x;
      const dy = feet[j].y - feet[i].y;
      const distance = Math.hypot(dx, dy);
      if (distance >= CONNECTION_DISTANCE) continue;

      const closeness = 1 - distance / CONNECTION_DISTANCE;
      const opacity = 0.075 + closeness * closeness * 0.32;
      ctx.strokeStyle = `rgba(88, 85, 79, ${opacity})`;
      ctx.beginPath();
      ctx.moveTo(feet[i].x, feet[i].y);
      ctx.lineTo(feet[j].x, feet[j].y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function triggerRandomGlitches(level, now) {
  const maxActive = Math.max(1, Math.ceil(people.length * 0.18));
  const activeCount = people.filter(person => person.glitchUntil > now).length;
  const availableSlots = Math.max(0, maxActive - activeCount);
  if (!availableSlots) return;

  const intensity = clamp((level - 0.03) / 0.17, 0, 1);
  const wanted = Math.max(1, Math.round(people.length * (0.04 + intensity * 0.11)));
  const eligible = people.filter(person => person.glitchUntil <= now && person.glitchCooldownUntil <= now);

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const selected = eligible.slice(0, Math.min(wanted, availableSlots));
  for (const person of selected) {
    person.glitchStrength = random(0.65, 1) * (0.65 + intensity * 0.55);
    person.glitchFrameJump = Math.floor(random(1, 4));
    person.glitchUntil = now + random(130, 330 + intensity * 370);
    person.glitchCooldownUntil = person.glitchUntil + random(650, 1700);
  }
}

function updateMicrophone(now) {
  if (!microphoneActive || !analyser || !audioSamples) return;
  analyser.getFloatTimeDomainData(audioSamples);
  let sum = 0;
  for (const sample of audioSamples) sum += sample * sample;
  const rms = Math.sqrt(sum / audioSamples.length);
  smoothedLevel = smoothedLevel * 0.76 + rms * 0.24;
  if (smoothedLevel < noiseFloor * 1.8) noiseFloor = noiseFloor * 0.992 + smoothedLevel * 0.008;
  const threshold = Math.max(0.028, noiseFloor * 2.6);

  if (smoothedLevel > threshold && now - lastGlitchPulse > 240) {
    triggerRandomGlitches(smoothedLevel, now);
    lastGlitchPulse = now;
  }

  if (now - lastMicLabelUpdate > 120) {
    const percent = Math.round(clamp(smoothedLevel / 0.18, 0, 1) * 100);
    microphoneStatus.textContent = `듣는 중 · 음량 ${percent}%`;
    lastMicLabelUpdate = now;
  }
}

async function stopMicrophone() {
  microphoneStream?.getTracks().forEach(track => track.stop());
  if (audioContext && audioContext.state !== 'closed') await audioContext.close();
  microphoneStream = null;
  audioContext = null;
  analyser = null;
  audioSamples = null;
  microphoneActive = false;
  microphoneButton.classList.remove('active');
  microphoneButton.textContent = '마이크 켜기';
  microphoneStatus.classList.remove('listening');
  microphoneStatus.textContent = '마이크 꺼짐';
}

async function startMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    microphoneStatus.textContent = 'localhost 또는 HTTPS 필요';
    return;
  }
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    const source = audioContext.createMediaStreamSource(microphoneStream);
    source.connect(analyser);
    audioSamples = new Float32Array(analyser.fftSize);
    microphoneActive = true;
    microphoneButton.classList.add('active');
    microphoneButton.textContent = '마이크 끄기';
    microphoneStatus.classList.add('listening');
    microphoneStatus.textContent = '듣는 중 · 말해보세요';
  } catch (error) {
    microphoneStatus.textContent = error.name === 'NotAllowedError' ? '마이크 권한이 필요함' : '마이크 연결 실패';
  }
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;
  frameTime = now;
  updateMicrophone(now);
  drawSpace();
  if (running) for (const person of people) person.update(dt);
  drawFootConnections();
  // 카메라에서 먼 사람부터 그려 앞사람이 자연스럽게 가린다.
  [...people]
    .map(person => ({ person, depth: project(person.x, 0, person.z).depth }))
    .sort((a, b) => b.depth - a.depth)
    .forEach(({ person }) => person.draw());
  requestAnimationFrame(frame);
}

population.addEventListener('input', () => setPopulation(Number(population.value)));
toggle.addEventListener('click', () => {
  running = !running;
  toggle.textContent = running ? '일시정지' : '계속하기';
});
microphoneButton.addEventListener('click', () => {
  if (microphoneActive) stopMicrophone();
  else startMicrophone();
});
addEventListener('resize', resize);
resize();
setPopulation(Number(population.value));
requestAnimationFrame(frame);
