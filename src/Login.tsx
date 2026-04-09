import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

interface LoginProps {
  onLogin: () => void;
}


const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [p_id, setp_id] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p_id || !password) {
      setError('아이디와 비밀번호를 입력하세요.');
      return;
    }
      // 입력값과 쿼리문을 alert로 표시
      const queryMsg = `입력한 아이디: ${p_id}\n입력한 비밀번호: ${password}\n쿼리: SELECT * FROM Member WHERE Id = '${p_id}'`;
      setLoading(true);
      setError('');
      // 1. ID만 확인
      const { data: idData, error: idError } = await supabase
        .from('member')
        .select('*')
        .eq('Id', p_id)
        .single();
      let resultMsg = '';
      if (idError || !idData) {
        alert(idError+' / '+idData?.id);
        setLoading(false);
        setError('아이디를 확인해 주세요.');
        resultMsg = '로그인 실패: 아이디가 존재하지 않습니다.';
        alert(resultMsg);
        return;
      }
      // 2. ID는 맞고 비밀번호만 확인
      if (idData.pwd !== password) {
        setLoading(false);
        setError('비밀번호를 확인해 주세요.');
        resultMsg = '로그인 실패: 비밀번호가 일치하지 않습니다.';
        return;
      }
      setLoading(false);
      resultMsg = '로그인 성공: 아이디와 비밀번호가 일치합니다.';
      // 세션 만료 시간(1시간 후) 저장
      const expire = Date.now() + 60 * 60 * 1000;
      localStorage.setItem('session_expire', expire.toString());
      onLogin();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 32, color: '#1976d2', letterSpacing: 2, textAlign: 'center' }}>KOLAS</div>
      <form onSubmit={handleSubmit} style={{ width: 320 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #1976d2' }}>
          <tbody>
            <tr>
              <td style={{ backgroundColor: '#1976d2', color: 'white', width: 90, textAlign: 'center', padding: 10, border: '1px solid #1976d2' }}>아이디</td>
              <td style={{ padding: 10, border: '1px solid #1976d2' }}>
                <input
                  type="text"
                  placeholder="아이디"
                  value={p_id}
                  onChange={e => setp_id(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    border: '1.5px solid #1976d2',
                    borderRadius: 4,
                    background: '#f4f8fb',
                    fontSize: 16,
                    outline: 'none',
                    marginTop: 2,
                    marginBottom: 2
                  }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ backgroundColor: '#1976d2', color: 'white', width: 90, textAlign: 'center', padding: 10, border: '1px solid #1976d2' }}>비밀번호</td>
              <td style={{ padding: 10, border: '1px solid #1976d2', position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="비밀번호"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    border: '1.5px solid #1976d2',
                    borderRadius: 4,
                    background: '#f4f8fb',
                    fontSize: 16,
                    outline: 'none',
                    marginTop: 2,
                    marginBottom: 2
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0
                  }}
                  tabIndex={-1}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {showPassword ? '👁️' : '🙈'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <button
          type="submit"
          style={{
            padding: 10,
            width: '100%',
            marginTop: 16,
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 16,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(25, 118, 210, 0.08)',
            opacity: loading ? 0.7 : 1
          }}
          disabled={loading}
        >
          {loading ? '확인 중...' : '로그인'}
        </button>
        {error && <div style={{ color: 'red', marginTop: 10 }}>{error}</div>}
      </form>
    </div>
  );
};

export default Login;
