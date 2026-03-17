'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Atom, Waves, HeartPulse, Shield, Activity, Share2,
  CheckCircle2, XCircle, Calculator, MessageSquare, Brain,
  RefreshCw, Send, ChevronRight, Minus, Zap, Beaker, FlaskConical
} from 'lucide-react';

// ======== TYPES ========
type PField = 'Electromagnetism' | 'Nuclear Physics' | 'Acoustics' | 'Bioelectricity' | 'Fluid Dynamics' | 'Thermodynamics';
interface PConcept {
  id: string; title: string; subtitle: string; physicsField: PField;
  icon: React.ElementType; gradient: string; color: string;
  principle: string; formula: string; formulaDesc: string;
  medicalApplication: string; howItWorks: string[]; funFact: string;
}

// ======== DATA ========
const concepts: PConcept[] = [
  {
    id: 'xray', title: 'X-Ray Imaging', subtitle: 'High-Energy Photons', physicsField: 'Electromagnetism', icon: Shield,
    gradient: 'linear-gradient(135deg,#a855f7,#d946ef)', color: '#c084fc',
    principle: 'X-rays are high-energy EM waves that penetrate tissue but are absorbed by dense materials like bone, creating shadow images.',
    formula: 'E = hf = hc/λ', formulaDesc: 'Energy equals Planck\'s constant × frequency.',
    medicalApplication: 'Detecting bone fractures, pneumonia, and dental issues.',
    howItWorks: ['Electrons accelerated in a vacuum tube.', 'They strike a tungsten target.', 'Sudden deceleration produces Bremsstrahlung X-rays.', 'Rays pass through the patient onto a detector.'],
    funFact: 'Röntgen\'s first X-ray image in 1895 was of his wife\'s hand, showing her wedding ring.'
  },
  {
    id: 'mri', title: 'MRI Scanner', subtitle: 'Nuclear Magnetic Resonance', physicsField: 'Nuclear Physics', icon: Atom,
    gradient: 'linear-gradient(135deg,#06b6d4,#3b82f6)', color: '#38bdf8',
    principle: 'A strong magnetic field aligns hydrogen protons. RF pulses knock them out of alignment; as they relax they emit detectable signals.',
    formula: 'ω = γB₀', formulaDesc: 'Larmor frequency = gyromagnetic ratio × field strength.',
    medicalApplication: 'Detailed soft-tissue imaging: brain, muscles, ligaments.',
    howItWorks: ['Patient enters a superconducting magnet.', 'Hydrogen protons align with B₀.', 'RF pulse flips protons to transverse plane.', 'Protons relax, emitting RF signals captured by coils.'],
    funFact: 'An MRI magnet is always on — strong enough to pull a wheelchair across the room.'
  },
  {
    id: 'ultrasound', title: 'Ultrasound', subtitle: 'High-Frequency Sound', physicsField: 'Acoustics', icon: Waves,
    gradient: 'linear-gradient(135deg,#10b981,#059669)', color: '#34d399',
    principle: 'Sound waves >20 kHz echo back at tissue boundaries. The return time determines depth.',
    formula: 'Z = ρc', formulaDesc: 'Acoustic impedance = density × speed of sound.',
    medicalApplication: 'Fetal imaging, organ examination, Doppler blood flow.',
    howItWorks: ['Piezoelectric crystals emit sound pulses.', 'Pulses travel through tissue at ~1540 m/s.', 'Waves reflect at tissue boundaries.', 'Crystals receive echoes → image.'],
    funFact: 'The same piezoelectric principle used in ultrasound is what sparks your gas lighter!'
  },
  {
    id: 'ecg', title: 'Electrocardiogram', subtitle: 'Cardiac Action Potentials', physicsField: 'Bioelectricity', icon: HeartPulse,
    gradient: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#f87171',
    principle: 'The heart generates electrical fields as cells depolarize/repolarize. Skin electrodes measure voltage differences over time.',
    formula: 'V = IR', formulaDesc: 'Voltage = Current × Resistance (Ohm\'s Law).',
    medicalApplication: 'Diagnosing arrhythmias, heart attacks, and blockages.',
    howItWorks: ['SA node generates an impulse.', 'Impulse spreads through atria (P wave).', 'Travels to ventricles via bundle branches (QRS).', 'Ventricles repolarize (T wave).'],
    funFact: 'The "beep... beep..." sound was designed so doctors don\'t have to watch the screen.'
  },
  {
    id: 'bp', title: 'Blood Pressure', subtitle: 'Hemodynamics', physicsField: 'Fluid Dynamics', icon: Activity,
    gradient: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fbbf24',
    principle: 'Blood flows high→low pressure. A cuff stops flow; as pressure drops, turbulent Korotkoff sounds mark systolic pressure.',
    formula: 'P + ½ρv² + ρgh = const', formulaDesc: 'Bernoulli\'s principle: pressure + kinetic + potential energy is conserved.',
    medicalApplication: 'Monitoring cardiovascular health, detecting hypertension.',
    howItWorks: ['Cuff inflated above systolic pressure.', 'Pressure slowly released.', 'Blood squeezes through → turbulent noise.', 'Noise stops → laminar flow (diastolic).'],
    funFact: 'Giraffes have BP of 280/180 mmHg — twice ours — so blood reaches their brains!'
  },
  {
    id: 'thermo', title: 'IR Thermometry', subtitle: 'Thermal Radiation', physicsField: 'Thermodynamics', icon: Share2,
    gradient: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fb923c',
    principle: 'All objects emit IR radiation proportional to temperature. A thermopile detector converts this heat into an electrical signal.',
    formula: 'P = εσAT⁴', formulaDesc: 'Stefan-Boltzmann Law: radiated power ∝ T⁴.',
    medicalApplication: 'Non-contact fever screening, skin temperature mapping.',
    howItWorks: ['Body emits far-infrared radiation.', 'Lens focuses the radiation.', 'Thermopile absorbs IR, heats slightly.', 'Heat → voltage via Seebeck effect.'],
    funFact: 'Forehead thermometers read the temporal artery — an excellent proxy for core temperature.'
  },
];

// ======== QUIZ DATA ========
interface QQ { conceptId: string; question: string; options: string[]; correctIdx: number; }
const quizPool: QQ[] = [
  { conceptId: 'xray', question: 'What determines X-ray penetrating power?', options: ['Amplitude', 'Frequency', 'Phase', 'Speed'], correctIdx: 1 },
  { conceptId: 'xray', question: 'Which material absorbs X-rays most?', options: ['Air', 'Fat', 'Muscle', 'Bone'], correctIdx: 3 },
  { conceptId: 'xray', question: 'Bremsstrahlung radiation occurs when:', options: ['Protons decay', 'Electrons decelerate suddenly', 'Neutrons collide', 'Photons merge'], correctIdx: 1 },
  { conceptId: 'xray', question: 'X-rays were discovered by:', options: ['Curie', 'Tesla', 'Röntgen', 'Faraday'], correctIdx: 2 },
  { conceptId: 'xray', question: 'X-ray wavelengths are in the range of:', options: ['1-100 m', '1-100 mm', '0.01-10 nm', '1-100 km'], correctIdx: 2 },
  { conceptId: 'mri', question: 'Which atom is primarily targeted in MRI?', options: ['Carbon', 'Oxygen', 'Hydrogen', 'Nitrogen'], correctIdx: 2 },
  { conceptId: 'mri', question: 'What does the RF pulse do in MRI?', options: ['Cools the magnet', 'Flips protons', 'Creates B₀', 'Blocks X-rays'], correctIdx: 1 },
  { conceptId: 'mri', question: 'Larmor frequency depends on:', options: ['Temperature & pressure', 'γ and B₀', 'H density', 'SNR'], correctIdx: 1 },
  { conceptId: 'mri', question: 'MRI magnets are typically:', options: ['Permanent magnets', 'Electromagnets', 'Superconducting magnets', 'Ferrite magnets'], correctIdx: 2 },
  { conceptId: 'mri', question: 'T1 relaxation refers to:', options: ['Transverse decay', 'Spin-spin relaxation', 'Longitudinal recovery', 'Free induction decay'], correctIdx: 2 },
  { conceptId: 'ultrasound', question: 'Which principle creates ultrasound waves?', options: ['Photoelectric', 'Piezoelectric', 'Compton', 'Doppler'], correctIdx: 1 },
  { conceptId: 'ultrasound', question: 'Why is gel used in ultrasound?', options: ['Lubrication', 'Sterilization', 'Impedance matching', 'Cooling'], correctIdx: 2 },
  { conceptId: 'ultrasound', question: 'Doppler ultrasound measures:', options: ['Bone density', 'Tumor size', 'Blood flow velocity', 'Air pockets'], correctIdx: 2 },
  { conceptId: 'ultrasound', question: 'Speed of sound in soft tissue is about:', options: ['340 m/s', '1540 m/s', '3000 m/s', '5000 m/s'], correctIdx: 1 },
  { conceptId: 'ultrasound', question: 'Higher frequency ultrasound gives:', options: ['Deeper penetration', 'Better resolution', 'Louder sound', 'Wider beam'], correctIdx: 1 },
  { conceptId: 'ecg', question: 'QRS complex represents:', options: ['Atrial depolarization', 'Atrial repolarization', 'Ventricular depolarization', 'Ventricular repolarization'], correctIdx: 2 },
  { conceptId: 'ecg', question: 'Natural pacemaker of the heart:', options: ['AV Node', 'Purkinje Fibers', 'Bundle of His', 'SA Node'], correctIdx: 3 },
  { conceptId: 'ecg', question: 'T wave corresponds to:', options: ['Atrial contraction', 'Ventricular repolarization', 'Valve closure', 'SA firing'], correctIdx: 1 },
  { conceptId: 'ecg', question: 'Normal heart rate range (bpm):', options: ['40-50', '60-100', '120-160', '180-220'], correctIdx: 1 },
  { conceptId: 'ecg', question: 'PR interval represents:', options: ['Ventricular contraction', 'AV conduction delay', 'Valve opening', 'Atrial repolarization'], correctIdx: 1 },
  { conceptId: 'bp', question: 'Korotkoff sounds are heard during:', options: ['ECG recording', 'Blood pressure measurement', 'Ultrasound', 'MRI scan'], correctIdx: 1 },
  { conceptId: 'bp', question: 'Per Bernoulli, increasing velocity means pressure:', options: ['Increases', 'Decreases', 'Stays constant', 'Fluctuates'], correctIdx: 1 },
  { conceptId: 'bp', question: 'Systolic pressure represents:', options: ['Heart relaxed', 'Vein pressure', 'Max ventricular contraction', 'Average over a minute'], correctIdx: 2 },
  { conceptId: 'bp', question: 'Normal blood pressure is approximately:', options: ['90/50', '120/80', '160/100', '200/140'], correctIdx: 1 },
  { conceptId: 'bp', question: 'Hypertension is defined as BP above:', options: ['100/60', '120/80', '140/90', '180/120'], correctIdx: 2 },
  { conceptId: 'thermo', question: 'IR thermometers measure via:', options: ['Conduction', 'Convection', 'Thermal Radiation', 'Latent Heat'], correctIdx: 2 },
  { conceptId: 'thermo', question: 'Which law relates radiated power to temperature?', options: ['Hooke\'s', 'Ohm\'s', 'Stefan-Boltzmann', 'Faraday\'s'], correctIdx: 2 },
  { conceptId: 'thermo', question: 'Core body temperature is roughly:', options: ['35 °C', '37 °C', '39 °C', '40 °C'], correctIdx: 1 },
  { conceptId: 'thermo', question: 'The Seebeck effect converts:', options: ['Light to electricity', 'Heat to voltage', 'Sound to current', 'Pressure to resistance'], correctIdx: 1 },
  { conceptId: 'thermo', question: 'Emissivity of human skin is approximately:', options: ['0.5', '0.7', '0.85', '0.98'], correctIdx: 3 },
];

// ======== SPRING CONFIG ========
const spring = { type: 'spring' as const, stiffness: 300, damping: 25 };

// ======== CANVAS SIMULATION ========
function WaveSimulation({ type, speed, amplitude, frequency }: { type: string; speed: number; amplitude: number; frequency: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    let raf: number, t = 0;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => { const r = c.getBoundingClientRect(); c.width = r.width * dpr; c.height = r.height * dpr; ctx.scale(dpr, dpr); };
    resize();
    const draw = () => {
      const r = c.getBoundingClientRect(), w = r.width, h = r.height;
      ctx.clearRect(0, 0, w, h); t += speed * 0.05;
      const cx = w / 2, cy = h / 2;
      ctx.lineWidth = 2; ctx.lineCap = 'round';

      if (type === 'xray') {
        ctx.beginPath(); ctx.strokeStyle = '#c084fc';
        for (let x = 0; x < w; x++) { const y = cy + Math.sin(x * 0.01 * frequency - t) * (amplitude * 0.6); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.beginPath(); ctx.strokeStyle = '#f472b6';
        for (let x = 0; x < w; x++) { const y = cy + Math.cos(x * 0.01 * frequency - t) * (amplitude * 0.3); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const px = (t * 100 + i * (w / 3)) % w, py = cy + Math.sin(px * 0.01 * frequency - t) * (amplitude * 0.6);
          ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.shadowColor = '#d946ef'; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
        }
      }
      else if (type === 'mri') {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
        const n = 8, sp = w / (n + 1);
        for (let i = 1; i <= n; i++) {
          const px = i * sp, a = t * frequency + i;
          ctx.beginPath(); ctx.arc(px, cy, 6, 0, Math.PI * 2); ctx.fillStyle = '#38bdf8'; ctx.fill();
          const vx = px + Math.cos(a) * (amplitude * 0.4), vy = cy + Math.sin(a) * (amplitude * 0.4);
          ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(vx, vy); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.ellipse(px, cy, amplitude * 0.4, amplitude * 0.12, 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(56,189,248,0.2)'; ctx.stroke();
        }
      }
      else if (type === 'ultrasound') {
        const bx = w * 0.75;
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, h); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '11px Inter'; ctx.fillText('Tissue Boundary', bx + 8, h - 16);
        const pw = 50, px = (t * 80) % (w * 1.4);
        ctx.beginPath(); ctx.lineWidth = 2;
        for (let x = 0; x < w; x++) {
          let y = cy;
          if (Math.abs(x - px) < pw) { const e = Math.cos((x - px) / pw * Math.PI / 2); y += Math.sin(x * 0.15 * frequency) * amplitude * e; ctx.strokeStyle = '#34d399'; }
          else if (px > bx && x < bx) { const rx = bx - (px - bx); if (Math.abs(x - rx) < pw) { const e = Math.cos((x - rx) / pw * Math.PI / 2); y += Math.sin(x * 0.15 * frequency) * amplitude * 0.35 * e; ctx.strokeStyle = '#10b981'; } else { ctx.strokeStyle = 'rgba(52,211,153,0.15)'; } }
          else ctx.strokeStyle = 'rgba(52,211,153,0.15)';
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      else if (type === 'ecg') {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5;
        for (let i = 0; i < w; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
        for (let j = 0; j < h; j += 20) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }
        ctx.lineWidth = 2.5; ctx.beginPath(); ctx.strokeStyle = '#f87171';
        const p = 200 / frequency;
        for (let x = 0; x < w; x++) {
          const tt = ((x - t * 50) % p + p) % p; let y = cy;
          if (tt > 20 && tt < 40) y -= Math.sin((tt - 20) / 20 * Math.PI) * (amplitude * 0.15);
          else if (tt > 60 && tt < 65) y += (tt - 60) / 5 * (amplitude * 0.1);
          else if (tt > 65 && tt < 70) y -= (tt - 65) / 5 * amplitude;
          else if (tt > 70 && tt < 75) y += (1 - (tt - 70) / 5) * amplitude + (tt - 70) / 5 * (amplitude * 0.2);
          else if (tt > 75 && tt < 80) y += (1 - (tt - 75) / 5) * (amplitude * 0.2);
          else if (tt > 110 && tt < 150) y -= Math.sin((tt - 110) / 40 * Math.PI) * (amplitude * 0.25);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        const lx = (t * 50) % w; ctx.beginPath(); ctx.arc(lx, cy, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
      }
      else if (type === 'bp') {
        const sc = cx, sw = 100;
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.beginPath();
        ctx.moveTo(0, cy - 60); ctx.lineTo(sc - sw, cy - 60);
        ctx.bezierCurveTo(sc - 20, cy - 60, sc - 20, cy - 20, sc, cy - 20);
        ctx.bezierCurveTo(sc + 20, cy - 20, sc + 20, cy - 60, sc + sw, cy - 60);
        ctx.lineTo(w, cy - 60); ctx.lineTo(w, cy + 60); ctx.lineTo(sc + sw, cy + 60);
        ctx.bezierCurveTo(sc + 20, cy + 60, sc + 20, cy + 20, sc, cy + 20);
        ctx.bezierCurveTo(sc - 20, cy + 20, sc - 20, cy + 60, sc - sw, cy + 60);
        ctx.lineTo(0, cy + 60); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        for (let i = 0; i < 35; i++) {
          const off = Math.sin(i * 123.45) * 50, bT = t * 30 + i * (w / 35);
          let px = bT % w; const py = cy + (off / 60) * 50 * 0.7;
          ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
          const inStenosis = Math.abs(px - sc) < sw; const sm = inStenosis ? 2.5 : 1;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 8 * sm, py); ctx.strokeStyle = 'rgba(251,191,36,0.3)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      else if (type === 'thermo') {
        const pulse = Math.sin(t * frequency) * 0.5 + 0.5, rad = 20 + pulse * 10;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 4);
        g.addColorStop(0, '#fb923c'); g.addColorStop(0.3, '#ea580c'); g.addColorStop(1, 'rgba(234,88,12,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad * 4, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 5; i++) {
          const wr = (t * 20 + i * 35) % 160 + rad, a = 1 - (wr - rad) / 160;
          if (a > 0) {
            ctx.strokeStyle = `rgba(253,186,116,${a})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, wr, -Math.PI / 3, Math.PI / 3); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, wr, Math.PI * 2 / 3, Math.PI * 4 / 3); ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); };
  }, [type, speed, amplitude, frequency]);
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

// ======== CALCULATOR ========
function PhysCalc({ c }: { c: PConcept }) {
  const [ins, setIns] = useState<Record<string, number>>({});
  const [res, setRes] = useState<number | null>(null);
  useEffect(() => { setIns({}); setRes(null); }, [c.id]);
  const calc = () => {
    switch (c.id) {
      case 'xray': if (ins.f) setRes(6.626e-34 * ins.f); break;
      case 'mri': if (ins.b0) setRes(42.58 * ins.b0); break;
      case 'ultrasound': if (ins.rho && ins.c) setRes(ins.rho * ins.c); break;
      case 'ecg': if (ins.i && ins.r) setRes(ins.i * ins.r); break;
      case 'bp': if (ins.v1 && ins.v2 && ins.rho) setRes(0.5 * ins.rho * (ins.v2 ** 2 - ins.v1 ** 2)); break;
      case 'thermo': if (ins.t) setRes(0.98 * 5.67e-8 * (ins.t + 273.15) ** 4); break;
    }
  };
  const unit: Record<string, string> = { xray: 'Joules', mri: 'MHz', ultrasound: 'Rayls', ecg: 'Volts', bp: 'Pascals (ΔP)', thermo: 'W/m²' };
  const fields: Record<string, { label: string; key: string; ph: string }[]> = {
    xray: [{ label: 'Frequency (Hz)', key: 'f', ph: 'e.g. 3e19' }],
    mri: [{ label: 'B₀ (Tesla)', key: 'b0', ph: 'e.g. 1.5 or 3.0' }],
    ultrasound: [{ label: 'Density ρ (kg/m³)', key: 'rho', ph: 'e.g. 1060' }, { label: 'Speed c (m/s)', key: 'c', ph: 'e.g. 1540' }],
    ecg: [{ label: 'Current I (A)', key: 'i', ph: 'e.g. 0.001' }, { label: 'Resistance R (Ω)', key: 'r', ph: 'e.g. 1000' }],
    bp: [{ label: 'Density ρ (kg/m³)', key: 'rho', ph: '1060' }, { label: 'V₁ (m/s)', key: 'v1', ph: 'Normal' }, { label: 'V₂ (m/s)', key: 'v2', ph: 'Stenosis' }],
    thermo: [{ label: 'Temperature (°C)', key: 't', ph: 'e.g. 37' }],
  };
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 28, marginTop: 32, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', borderRadius: '20px 0 0 20px', background: c.gradient }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color }}><Calculator size={20} /></div>
        <div><div style={{ fontWeight: 700, fontSize: 18 }}>Physics Calculator</div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Compute {c.formula}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: fields[c.id].length > 2 ? '1fr 1fr 1fr' : fields[c.id].length > 1 ? '1fr 1fr' : '1fr', gap: 12 }}>
            {fields[c.id].map(f => (
              <div key={f.key}><label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input type="number" placeholder={f.ph} onChange={e => setIns({ ...ins, [f.key]: Number(e.target.value) })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: 14, outline: 'none' }} /></div>
            ))}
          </div>
          <button onClick={calc} style={{ marginTop: 16, padding: '10px 28px', borderRadius: 12, border: 'none', background: c.gradient, color: 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Calculate</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {res !== null ? (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ textAlign: 'center', padding: 28, borderRadius: 20, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', width: '100%' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, fontWeight: 600 }}>Result</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: c.color }}>{res > 1e3 || res < 0.001 ? res.toExponential(3) : res.toFixed(3)}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{unit[c.id]}</div>
            </motion.div>
          ) : (
            <div style={{ textAlign: 'center', padding: 28, borderRadius: 20, border: '2px dashed rgba(255,255,255,0.08)', width: '100%', opacity: 0.4 }}>
              <Calculator size={24} style={{ marginBottom: 8, color: 'var(--text-muted)' }} /><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Enter values to calculate</div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ======== CHAT WIDGET ========
interface CMsg { role: 'user' | 'assistant'; content: string; }
function ChatWidget({ concept }: { concept: PConcept }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<CMsg[]>([]);
  const [inp, setInp] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);
  const send = (text: string) => {
    if (!text.trim() || loading) return;
    const n = [...msgs, { role: 'user' as const, content: text }];
    setMsgs(n); setInp(''); setLoading(true);
    fetch('/api/ai/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: n, systemPrompt: `You are a physics tutor. The user is studying ${concept.title} (${concept.physicsField}). Key formula: ${concept.formula}. Principle: ${concept.principle}` })
    }).then(r => r.json()).then(d => { setMsgs([...n, { role: 'assistant', content: d.response || d.message || 'I can help explain this concept!' }]); setLoading(false); })
      .catch(() => { setMsgs([...n, { role: 'assistant', content: `Great question about **${concept.title}**! The key formula \`${concept.formula}\` tells us that ${concept.formulaDesc} In clinical practice, this is used for ${concept.medicalApplication.toLowerCase()}` }]); setLoading(false); });
  };
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 50 }}>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} transition={{ duration: 0.25 }}
            style={{ position: 'absolute', bottom: 64, right: 0, width: 370, height: 480, background: 'rgba(15,20,35,0.95)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: concept.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Atom size={16} color="white" /></div>
                <div><div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>AI Physics Tutor</div><div style={{ fontSize: 11, color: concept.color }}>{concept.title}</div></div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Minus size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {msgs.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                  <MessageSquare size={28} style={{ marginBottom: 12 }} />
                  <p style={{ fontSize: 13, marginBottom: 20 }}>Ask about {concept.title}!</p>
                  {['Explain the formula', 'How is this used clinically?', 'Give a real-world example'].map((p, i) => (
                    <button key={i} onClick={() => send(p)} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: 6, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 12, cursor: 'pointer' }}>{p}</button>
                  ))}
                </div>
              ) : msgs.map((m, i) => (
                <div key={i} style={{
                  maxWidth: '82%', padding: '10px 14px', borderRadius: 16, fontSize: 13, lineHeight: 1.5, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  background: m.role === 'user' ? concept.gradient : 'rgba(255,255,255,0.06)',
                  border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)', color: 'white',
                  borderBottomRightRadius: m.role === 'user' ? 4 : 16, borderBottomLeftRadius: m.role === 'assistant' ? 4 : 16
                }}>
                  {m.content}
                </div>
              ))}
              {loading && <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 6 }}>
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
              </div>}
              <div ref={endRef} />
            </div>
            <form onSubmit={e => { e.preventDefault(); send(inp); }} style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
              <input value={inp} onChange={e => setInp(e.target.value)} placeholder="Ask a question..." style={{ flex: 1, padding: '8px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: 13, outline: 'none' }} />
              <button type="submit" disabled={!inp.trim() || loading} style={{ width: 38, height: 38, borderRadius: 12, border: 'none', background: concept.gradient, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: !inp.trim() || loading ? 0.4 : 1 }}><Send size={15} /></button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} onClick={() => setOpen(!open)}
        style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', background: concept.gradient, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        {open ? <XCircle size={24} /> : <MessageSquare size={24} />}
      </motion.button>
    </div>
  );
}

// ======== QUIZ ENGINE ========
function QuizEngine() {
  const [qs, setQs] = useState<QQ[]>([]);
  const [ci, setCi] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState<{ q: QQ; ok: boolean }[]>([]);
  const start = () => { const sh = [...quizPool].sort(() => 0.5 - Math.random()).slice(0, 10); setQs(sh); setCi(0); setSel(null); setAnswered(false); setScore(0); setResults([]); setStarted(true); setFinished(false); };
  const check = () => { if (sel === null) return; const ok = sel === qs[ci].correctIdx; if (ok) setScore(s => s + 1); setResults(p => [...p, { q: qs[ci], ok }]); setAnswered(true); };
  const next = () => { if (ci === qs.length - 1) { setFinished(true); } else { setCi(i => i + 1); setSel(null); setAnswered(false); } };
  if (!started) return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 56, textAlign: 'center', marginTop: 48, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Brain size={32} color="white" /></div>
      <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Test Your Knowledge</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 32, fontSize: 15 }}>10 randomized questions across all physics modules.</p>
      <button onClick={start} style={{ padding: '14px 40px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Start Quiz</button>
    </motion.div>
  );
  if (finished) {
    const pct = Math.round(score / qs.length * 100);
    const clr = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
    return (
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={spring}
        style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 36, marginTop: 48, maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}><h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Quiz Results</h2><p style={{ color: 'var(--text-muted)' }}>{pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good job!' : 'Keep studying!'}</p></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 180, height: 180 }}>
              <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                <motion.circle cx="50" cy="50" r="45" fill="none" stroke={clr} strokeWidth="10" strokeDasharray={283}
                  initial={{ strokeDashoffset: 283 }} animate={{ strokeDashoffset: 283 - (283 * pct) / 100 }} transition={{ duration: 1.5, ease: 'easeOut' }} strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 40, fontWeight: 900 }}>{pct}%</div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{score}/{qs.length}</div>
              </div>
            </div>
            <button onClick={start} style={{ marginTop: 32, padding: '10px 24px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}><RefreshCw size={16} />Try Again</button>
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 8 }}>
            {results.map((r, i) => (
              <div key={i} style={{ padding: 14, borderRadius: 14, border: `1px solid ${r.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, background: r.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {r.ok ? <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0, marginTop: 2 }} /> : <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />}
                <div><div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{r.q.question}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Answer: <span style={{ color: 'white' }}>{r.q.options[r.q.correctIdx]}</span></div></div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }
  const q = qs[ci], rc = concepts.find(cc => cc.id === q.conceptId);
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderTop: `4px solid ${rc?.color || '#fff'}`, borderRadius: 24, padding: 36, marginTop: 48, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, justifyContent: 'center' }}>
        {qs.map((_, i) => (<div key={i} style={{ height: 5, borderRadius: 5, transition: 'all 0.3s', width: i === ci ? 32 : 8, background: i === ci ? 'white' : i < ci ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)' }} />))}
      </div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: rc?.color, marginBottom: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        {rc && React.createElement(rc.icon, { size: 14 })}{rc?.title}
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 28, lineHeight: 1.4 }}>{q.question}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {q.options.map((o, i) => {
          let bg = 'rgba(255,255,255,0.04)', bd = 'rgba(255,255,255,0.08)';
          if (answered) { if (i === q.correctIdx) { bg = 'rgba(16,185,129,0.15)'; bd = 'rgba(16,185,129,0.4)'; } else if (i === sel) { bg = 'rgba(239,68,68,0.15)'; bd = 'rgba(239,68,68,0.4)'; } else { bg = 'rgba(255,255,255,0.02)'; bd = 'rgba(255,255,255,0.04)'; } }
          else if (sel === i) { bg = 'rgba(255,255,255,0.1)'; bd = 'rgba(255,255,255,0.3)'; }
          return (<button key={i} disabled={answered} onClick={() => setSel(i)} style={{ width: '100%', textAlign: 'left', padding: '14px 18px', borderRadius: 14, border: `2px solid ${bd}`, background: bg, color: 'white', cursor: answered ? 'default' : 'pointer', fontWeight: 500, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s' }}>
            <span>{o}</span>
            {answered && i === q.correctIdx && <CheckCircle2 size={18} style={{ color: '#10b981' }} />}
            {answered && i === sel && i !== q.correctIdx && <XCircle size={18} style={{ color: '#ef4444' }} />}
          </button>);
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Q {ci + 1} of {qs.length}</span>
        {!answered ? (<button onClick={check} disabled={sel === null} style={{ padding: '12px 32px', borderRadius: 14, border: 'none', background: sel === null ? 'rgba(255,255,255,0.06)' : 'white', color: sel === null ? 'rgba(255,255,255,0.3)' : 'black', fontWeight: 700, cursor: sel === null ? 'default' : 'pointer', fontSize: 15 }}>Check Answer</button>
        ) : (<button onClick={next} style={{ padding: '12px 32px', borderRadius: 14, border: 'none', background: 'var(--color-primary)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>{ci === qs.length - 1 ? 'Finish' : 'Next'}<ChevronRight size={18} /></button>)}
      </div>
    </motion.div>
  );
}

// ======== STATS ========
const stats = [
  { label: 'Domains', value: '6', icon: Beaker, color: '#8b5cf6' },
  { label: 'Equations', value: '6', icon: FlaskConical, color: '#06b6d4' },
  { label: 'Applications', value: '12+', icon: Zap, color: '#10b981' },
  { label: 'Simulations', value: '6', icon: Activity, color: '#f59e0b' },
];

// ======== MAIN COMPONENT ========
export default function PhysicsLabContent() {
  const [selected, setSelected] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [amplitude, setAmplitude] = useState(60);
  const [frequency, setFrequency] = useState(1);
  const c = concepts[selected];

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={spring} style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Atom size={26} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>Physics of Medicine</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Interactive simulations & learning lab</p>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.08 }}
            style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
              {React.createElement(s.icon, { size: 20 })}
            </div>
            <div><div style={{ fontSize: 24, fontWeight: 800 }}>{s.value}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div></div>
          </motion.div>
        ))}
      </div>

      {/* Concept Tabs */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginBottom: 32, scrollbarWidth: 'none' }}>
        {concepts.map((cc, i) => (
          <motion.button key={cc.id} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            onClick={() => setSelected(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 50, border: `2px solid ${i === selected ? cc.color : 'rgba(255,255,255,0.08)'}`,
              background: i === selected ? `${cc.color}20` : 'rgba(255,255,255,0.03)', color: i === selected ? cc.color : 'var(--text-muted)',
              fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.3s'
            }}>
            {React.createElement(cc.icon, { size: 16 })}
            {cc.title}
          </motion.button>
        ))}
      </div>

      {/* Main Grid: Canvas + Info */}
      <AnimatePresence mode="wait">
        <motion.div key={c.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={spring}
          style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 28, marginBottom: 32 }}>

          {/* Left: Canvas + sliders */}
          <div>
            <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden' }}>
              <div style={{ height: 320, position: 'relative' }}>
                <WaveSimulation type={c.id} speed={speed} amplitude={amplitude} frequency={frequency} />
                <div style={{ position: 'absolute', top: 12, left: 14, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', borderRadius: 10, padding: '6px 12px', fontSize: 11, fontWeight: 600, color: c.color, border: `1px solid ${c.color}30` }}>
                  {c.physicsField}
                </div>
              </div>
              <div style={{ padding: '18px 22px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[{ label: 'Speed', value: speed, set: setSpeed, min: 0.1, max: 3, step: 0.1 },
                { label: 'Amplitude', value: amplitude, set: setAmplitude, min: 10, max: 120, step: 5 },
                { label: 'Frequency', value: frequency, set: setFrequency, min: 0.2, max: 3, step: 0.1 }].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 72, fontWeight: 500 }}>{s.label}</span>
                    <input type="range" min={s.min} max={s.max} step={s.step} value={s.value} onChange={e => s.set(Number(e.target.value))}
                      style={{ flex: 1, accentColor: c.color, height: 4 }} />
                    <span style={{ fontSize: 12, color: c.color, fontWeight: 700, width: 36, textAlign: 'right' }}>{s.value.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 40, height: 40, borderRadius: 14, background: c.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {React.createElement(c.icon, { size: 20, color: 'white' })}
                </div>
                <div><h2 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{c.title}</h2><p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{c.subtitle}</p></div>
              </div>
            </div>

            {/* Formula */}
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '20px 24px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, fontWeight: 600 }}>Key Equation</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: c.color, fontFamily: 'monospace', marginBottom: 6 }}>{c.formula}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{c.formulaDesc}</div>
            </div>

            {/* Principle */}
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '20px 24px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, fontWeight: 600 }}>Physical Principle</div>
              <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>{c.principle}</p>
            </div>

            {/* Medical Application */}
            <div style={{ background: `${c.color}08`, borderRadius: 16, padding: '20px 24px', border: `1px solid ${c.color}20` }}>
              <div style={{ fontSize: 11, color: c.color, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, fontWeight: 600 }}>Medical Application</div>
              <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>{c.medicalApplication}</p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* How It Works */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>How It Works</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {c.howItWorks.map((step, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.1 }}
              style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 18px', position: 'relative' }}>
              <div style={{ width: 28, height: 28, borderRadius: 10, background: c.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'white', marginBottom: 12 }}>{i + 1}</div>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: 'var(--text-secondary)' }}>{step}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Fun Fact */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        style={{ background: `${c.color}08`, borderLeft: `4px solid ${c.color}`, borderRadius: '0 16px 16px 0', padding: '16px 22px', marginBottom: 32, fontSize: 14, lineHeight: 1.6 }}>
        <span style={{ fontWeight: 700, color: c.color }}>Fun Fact: </span>{c.funFact}
      </motion.div>

      {/* Calculator */}
      <PhysCalc c={c} />

      {/* Quiz */}
      <QuizEngine />

      {/* Chat Widget */}
      <ChatWidget concept={c} />

      <div style={{ height: 80 }} />
    </div>
  );
}
