<script lang="ts">
  let isLogin = $state(true);
  let username = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);
  let message = $state('');
  let isError = $state(false);
  let loading = $state(false);

  function resetMessage() {
    message = '';
    isError = false;
  }

  function switchMode(toLogin: boolean) {
    isLogin = toLogin;
    confirmPassword = '';
    resetMessage();
  }

  function getApiBase() {
    if (import.meta.env.VITE_SERVER_URL) {
      return import.meta.env.VITE_SERVER_URL.replace(/^ws/, 'http');
    }
    if (typeof window === 'undefined') return 'http://localhost:2567';
    const proto = window.location.protocol === 'https:' ? 'https' : 'http';
    return `${proto}://${window.location.hostname}:2567`;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    resetMessage();

    if (!username.trim() || !password) {
      isError = true;
      message = 'กรุณากรอกข้อมูลให้ครบถ้วน';
      return;
    }
    if (!isLogin && password !== confirmPassword) {
      isError = true;
      message = 'รหัสผ่านไม่ตรงกัน';
      return;
    }

    loading = true;
    const url = isLogin ? '/api/login' : '/api/register';
    try {
      const response = await fetch(`${getApiBase()}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (response.ok) {
        if (isLogin) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('username', data.username);
          window.location.href = '/';
        } else {
          isError = false;
          message = 'สมัครสมาชิกสำเร็จ! โปรดเข้าสู่ระบบ';
          switchMode(true);
        }
      } else {
        isError = true;
        message = data.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
      }
    } catch (err) {
      isError = true;
      message = 'ไม่สามารถเชื่อมต่อ Server ได้';
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <div class="avatar"><img src="https://s6.imgcdn.dev/YbrGfe.png" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;" /></div>

    <h1>{isLogin ? 'Welcome' : 'Create your account'}</h1>
    <p class="subtitle">{isLogin ? 'Enter your details to login.' : 'Enter your details to get started.'}</p>

    <div class="divider"></div>

    <form onsubmit={handleSubmit} autocomplete="off">
      <label for="username">Username</label>
      <div class="input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="field-icon"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>
        <input id="username" type="text" bind:value={username} placeholder="e.g. player123" />
      </div>

      <label for="password">Password</label>
      <div class="input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="field-icon"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        <input id="password" type={showPassword ? 'text' : 'password'} bind:value={password} placeholder="••••••••" />
        <button type="button" class="eye-btn" onclick={() => showPassword = !showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'}>
          {#if showPassword}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a14.6 14.6 0 0 1-3.1 4"/><path d="M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8"/><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          {/if}
        </button>
      </div>

      {#if !isLogin}
        <label for="confirm-password">Confirm password</label>
        <div class="input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="field-icon"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          <input id="confirm-password" type={showConfirmPassword ? 'text' : 'password'} bind:value={confirmPassword} placeholder="••••••••" />
          <button type="button" class="eye-btn" onclick={() => showConfirmPassword = !showConfirmPassword} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
            {#if showConfirmPassword}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a14.6 14.6 0 0 1-3.1 4"/><path d="M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8"/><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2"/></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            {/if}
          </button>
        </div>
      {/if}

      <div style="margin-bottom: 24px;"></div>

      {#if message}
        <p class="form-message" class:error={isError}>{message}</p>
      {/if}

      <button type="submit" class="submit-btn" disabled={loading}>
        {#if loading}
          {isLogin ? 'Logging in…' : 'Creating account…'}
        {:else}
          {isLogin ? 'Login' : 'Register'}
        {/if}
      </button>
    </form>

    <p class="switch-text">
      {isLogin ? "Don't have an account?" : 'Already have an account?'}
      <button type="button" class="switch-link" onclick={() => switchMode(!isLogin)}>
        {isLogin ? 'Register' : 'Login'}
      </button>
    </p>
  </div>
</div>

<style>
  .auth-page {
    --brand-1: #5c3a26;
    --brand-2: #352115;
    --brand-3: #20140c;
    min-height: 100vh;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-image: url('https://s6.imgcdn.dev/YeMpiL.png');
    background-size: cover;
    background-attachment: fixed;
    background-position: center;
    background-repeat: no-repeat;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    padding: 24px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .auth-card {
    width: 100%;
    max-width: 408px;
    background: #ffffff;
    border-radius: 22px;
    padding: 40px 36px 32px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 18px 40px -12px rgba(0,0,0,0.10);
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: card-in .35s ease-out;
  }

  @keyframes card-in {
    from { opacity: 0; transform: translateY(8px) scale(.99); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .auth-card { animation: none; }
  }

  .avatar {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  h1 {
    margin: 18px 0 4px;
    font-size: 21px;
    font-weight: 700;
    color: #1a1a1a;
    text-align: center;
  }

  .subtitle {
    margin: 0;
    font-size: 13.5px;
    color: #8a8a8a;
    text-align: center;
  }

  .divider {
    width: 100%;
    height: 1px;
    background: #ececea;
    margin: 22px 0 20px;
  }

  form {
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  label {
    font-size: 12.5px;
    font-weight: 600;
    color: #2a2a2a;
    margin: 14px 0 6px;
  }
  label:first-of-type { margin-top: 0; }

  .input-wrap {
    display: flex;
    align-items: center;
    width: 100%;
    height: 46px;
    border: 1px solid #e3e1de;
    border-radius: 11px;
    padding: 0 13px;
    background: #fff;
    transition: border-color .15s, box-shadow .15s;
    box-sizing: border-box;
  }
  .input-wrap:focus-within {
    border-color: var(--brand-2);
    box-shadow: 0 0 0 3px rgba(53,33,21,0.09);
  }

  .field-icon {
    width: 17px;
    height: 17px;
    color: #a3a19c;
    flex-shrink: 0;
    margin-right: 9px;
  }

  .input-wrap input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    color: #1a1a1a;
    height: 100%;
    font-family: inherit;
  }
  .input-wrap input::placeholder { color: #b8b6b2; }

  .eye-btn {
    background: none;
    border: none;
    padding: 4px;
    margin-left: 6px;
    color: #a3a19c;
    cursor: pointer;
    display: flex;
    align-items: center;
    border-radius: 6px;
  }
  .eye-btn:hover { color: #5c5a56; }
  .eye-btn svg { width: 18px; height: 18px; }
  .eye-btn:focus-visible { outline: 2px solid var(--brand-2); outline-offset: 1px; }

  .row-between {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 16px 0 22px;
    font-size: 13px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .checkbox {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #4a4a4a;
    cursor: pointer;
    margin: 0;
    font-size: 13px;
    font-weight: 400;
  }
  .checkbox input[type="checkbox"] {
    width: 15px;
    height: 15px;
    accent-color: var(--brand-2);
    cursor: pointer;
  }

  .link {
    color: #2a2a2a;
    font-weight: 500;
    text-decoration: none;
  }
  .link:hover { color: var(--brand-2); text-decoration: underline; }

  .spacer-sm { height: 18px; }

  .form-message {
    font-size: 12.5px;
    text-align: center;
    margin: 0 0 12px;
    color: #2f7a3d;
  }
  .form-message.error { color: #c5372f; }

  .submit-btn {
    width: 100%;
    height: 47px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--brand-1), var(--brand-3));
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: .2px;
    cursor: pointer;
    box-shadow: 0 6px 16px -4px rgba(53,33,21,0.45);
    transition: filter .15s, transform .15s, opacity .15s;
    box-sizing: border-box;
  }
  .submit-btn:hover:not(:disabled) { filter: brightness(1.07); transform: translateY(-1px); }
  .submit-btn:active:not(:disabled) { transform: translateY(0); filter: brightness(0.97); }
  .submit-btn:disabled { opacity: .7; cursor: default; }
  .submit-btn:focus-visible { outline: 2px solid var(--brand-2); outline-offset: 2px; }

  .switch-text {
    margin: 22px 0 0;
    font-size: 13.5px;
    color: #6e6e6e;
    text-align: center;
  }

  .switch-link {
    background: none;
    border: none;
    color: var(--brand-2);
    font-weight: 700;
    font-size: 13.5px;
    cursor: pointer;
    padding: 0;
    margin-left: 4px;
  }
  .switch-link:hover { text-decoration: underline; }

  @media (max-width: 420px) {
    .auth-card { padding: 32px 24px 26px; border-radius: 18px; }
  }
</style>
