import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

export default function TaskRunner({ taskId, navigate }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [focusActive, setFocusActive] = useState(false);
  const [reward, setReward] = useState(null); // { secondsLeft }
  const [currentStep, setCurrentStep] = useState(0);
  const timerRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'tasks', taskId), (snap) => {
      if (!snap.exists()) { navigate('dashboard'); return; }
      const data = { id: snap.id, ...snap.data() };
      setTask(data);
      setCurrentStep(data.currentStepIndex ?? 0);
      setLoading(false);
    });
    return unsub;
  }, [taskId, navigate]);

  // Clean up timer on unmount
  useEffect(() => () => clearInterval(timerRef.current), []);

  const startFocus = useCallback(async () => {
    // Request fullscreen
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {}
    setFocusActive(true);
    if (task?.status === 'pending') {
      await updateDoc(doc(db, 'tasks', taskId), {
        status: 'in_progress',
        updatedAt: serverTimestamp(),
      });
    }
  }, [task, taskId]);

  const exitFocus = useCallback(async () => {
    clearInterval(timerRef.current);
    setFocusActive(false);
    setReward(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {}
  }, []);

  const completeStep = useCallback(async () => {
    if (!task) return;
    const steps = task.steps.map((s, i) =>
      i === currentStep ? { ...s, completed: true } : s
    );
    const nextStep = currentStep + 1;
    const allDone = nextStep >= steps.length;

    await updateDoc(doc(db, 'tasks', taskId), {
      steps,
      currentStepIndex: allDone ? currentStep : nextStep,
      status: allDone ? 'completed' : 'in_progress',
      updatedAt: serverTimestamp(),
    });

    if (allDone) {
      exitFocus();
      return;
    }

    // Start reward timer
    const totalSeconds = (task.rewardMinutes ?? 10) * 60;
    setReward({ secondsLeft: totalSeconds });
    setCurrentStep(nextStep);

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setReward(r => {
        if (!r) return null;
        if (r.secondsLeft <= 1) {
          clearInterval(timerRef.current);
          return null;
        }
        return { secondsLeft: r.secondsLeft - 1 };
      });
    }, 1000);
  }, [task, taskId, currentStep, exitFocus]);

  const skipReward = () => {
    clearInterval(timerRef.current);
    setReward(null);
  };

  const handleDelete = async () => {
    if (!confirm('この課題を削除しますか？')) return;
    await deleteDoc(doc(db, 'tasks', taskId));
    navigate('dashboard');
  };

  if (loading) return <div className="loading">読み込み中...</div>;
  if (!task) return null;

  const steps = task.steps ?? [];
  const step = steps[currentStep];
  const doneCount = steps.filter(s => s.completed).length;
  const progress = steps.length > 0 ? (doneCount / steps.length) * 100 : 0;
  const allCompleted = task.status === 'completed';

  // Focus mode overlay
  if (focusActive) {
    return (
      <FocusOverlay
        task={task}
        step={step}
        currentStep={currentStep}
        totalSteps={steps.length}
        doneCount={doneCount}
        progress={progress}
        reward={reward}
        allCompleted={allCompleted}
        onCompleteStep={completeStep}
        onSkipReward={skipReward}
        onExit={exitFocus}
      />
    );
  }

  // Normal view
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <header className="app-header">
        <div className="container">
          <button className="btn btn-outline btn-sm" onClick={() => navigate('dashboard')}>
            ← 戻る
          </button>
          <h1 style={{ fontSize: '16px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.title}
          </h1>
          <button
            className="btn btn-sm"
            onClick={handleDelete}
            style={{ color: 'var(--danger)', background: 'none', fontSize: '13px', fontWeight: '600' }}
          >
            削除
          </button>
        </div>
      </header>

      <main className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        {/* Task info */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <TypeBadge type={task.type} />
            <span style={{
              fontSize: '12px', padding: '3px 10px', borderRadius: '100px', fontWeight: '600',
              background: allCompleted ? '#dcfce7' : task.status === 'in_progress' ? '#fef9c3' : 'var(--surface2)',
              color: allCompleted ? '#166534' : task.status === 'in_progress' ? '#854d0e' : 'var(--text-muted)',
            }}>
              {allCompleted ? '完了' : task.status === 'in_progress' ? '進行中' : '未着手'}
            </span>
          </div>
          {task.description && (
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              {task.description}
            </p>
          )}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>進捗 {doneCount}/{steps.length}</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: progress === 100 ? 'var(--success)' : 'var(--primary)' }}>
                {Math.round(progress)}%
              </span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%`, background: progress === 100 ? 'var(--success)' : undefined }} />
            </div>
          </div>
        </div>

        {/* Steps list */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
            ステップ一覧
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {steps.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: s.completed ? '#f0fdf4' : i === currentStep && !allCompleted ? 'var(--primary-light)' : 'var(--surface2)',
                  border: '1.5px solid',
                  borderColor: s.completed ? '#bbf7d0' : i === currentStep && !allCompleted ? 'var(--primary)' : 'transparent',
                  opacity: s.completed ? 0.7 : 1,
                }}
              >
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: s.completed ? 'var(--success)' : i === currentStep && !allCompleted ? 'var(--primary)' : 'var(--border)',
                  color: s.completed || (i === currentStep && !allCompleted) ? 'white' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: '700',
                  flexShrink: 0,
                }}>
                  {s.completed ? '✓' : i + 1}
                </div>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', textDecoration: s.completed ? 'line-through' : 'none' }}>
                    {s.title}
                  </p>
                  {s.description && (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {s.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action button */}
        {allCompleted ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎉</div>
            <p style={{ fontWeight: '700', fontSize: '18px', marginBottom: '6px' }}>課題完了！</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>お疲れ様でした。</p>
            <button className="btn btn-outline" onClick={() => navigate('dashboard')}>
              ダッシュボードへ
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary btn-full"
            onClick={startFocus}
            style={{ padding: '16px', fontSize: '16px', borderRadius: '12px' }}
          >
            🎯 集中モードで始める
          </button>
        )}
      </main>
    </div>
  );
}

function FocusOverlay({ task, step, currentStep, totalSteps, doneCount, progress, reward, allCompleted, onCompleteStep, onSkipReward, onExit }) {
  const fmt = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const rewardPct = reward
    ? ((task.rewardMinutes * 60 - reward.secondsLeft) / (task.rewardMinutes * 60)) * 100
    : 0;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: reward ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      color: 'white',
      transition: 'background 0.5s',
    }}>
      {/* Exit button */}
      <button
        onClick={onExit}
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'rgba(255,255,255,0.15)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          padding: '8px 14px',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer',
        }}
      >
        終了
      </button>

      {/* Progress */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'rgba(255,255,255,0.15)' }}>
        <div style={{ height: '100%', background: reward ? '#22c55e' : '#818cf8', width: `${progress}%`, transition: 'width 0.5s' }} />
      </div>

      <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        {allCompleted ? (
          // All done
          <>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ fontSize: '26px', fontWeight: '700', marginBottom: '8px' }}>すべて完了！</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '32px' }}>お疲れ様でした！</p>
            <button className="btn btn-success" onClick={onExit} style={{ fontSize: '16px', padding: '14px 32px', borderRadius: '12px' }}>
              終わる
            </button>
          </>
        ) : reward ? (
          // Reward mode
          <>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎮</div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>ご褒美タイム！</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '24px' }}>
              次のステップまで自由に休憩してください
            </p>

            {/* Circular countdown */}
            <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto 24px' }}>
              <svg width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                <circle
                  cx="80" cy="80" r="70"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 70}`}
                  strokeDashoffset={`${2 * Math.PI * 70 * (rewardPct / 100)}`}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '32px', fontWeight: '700' }}>{fmt(reward.secondsLeft)}</span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>残り時間</span>
              </div>
            </div>

            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '16px' }}>
              次のステップ {currentStep + 1}/{totalSteps}: {step?.title}
            </p>

            <button
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: 'white',
                border: '1.5px solid rgba(255,255,255,0.3)',
                borderRadius: '10px',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
              onClick={onSkipReward}
            >
              スキップして次のステップへ
            </button>
          </>
        ) : (
          // Focus mode
          <>
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '6px 16px',
              display: 'inline-block',
              fontSize: '13px',
              color: 'rgba(255,255,255,0.7)',
              marginBottom: '20px',
            }}>
              ステップ {currentStep + 1} / {totalSteps}
            </div>

            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🎯</div>

            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px', lineHeight: 1.3 }}>
              {step?.title}
            </h2>

            {step?.description && (
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
                {step.description}
              </p>
            )}

            {!step?.description && <div style={{ marginBottom: '24px' }} />}

            {/* Completed steps mini */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '32px' }}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === currentStep ? '24px' : '8px',
                    height: '8px',
                    borderRadius: '100px',
                    background: i < currentStep ? '#22c55e' : i === currentStep ? '#818cf8' : 'rgba(255,255,255,0.2)',
                    transition: 'all 0.3s',
                  }}
                />
              ))}
            </div>

            <button
              className="btn btn-success"
              onClick={onCompleteStep}
              style={{
                fontSize: '17px',
                padding: '16px 40px',
                borderRadius: '14px',
                boxShadow: '0 4px 20px rgba(34,197,94,0.4)',
              }}
            >
              ✓ このステップを完了
            </button>

            <p style={{ marginTop: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
              完了するとご褒美タイムが始まります
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function TypeBadge({ type }) {
  const map = { report: ['badge-report', 'レポート'], quiz: ['badge-quiz', '確認テスト'], other: ['badge-other', 'その他'] };
  const [cls, label] = map[type] ?? ['badge-other', type];
  return <span className={`badge ${cls}`}>{label}</span>;
}
