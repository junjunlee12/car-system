import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// 1. Supabase 접속 정보
const SUPABASE_URL = 'https://vafbgzrhxhkvuvfwehfk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iu4MZpgtwmVqEGc_gZjJOg_6m6yjUQz';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  // --- [상태 관리] ---
  const [user, setUser] = useState(null);
  const [loginInput, setLoginInput] = useState({ username: '', password: '' });
  const [activeTab, setActiveTab] = useState('status');
  const [searchQuery, setSearchQuery] = useState('');
  const [allCars, setAllCars] = useState([]);
  
  // [개선] 탭 이동 및 새로고침 시에도 입력 데이터 보존을 위해 초기값을 서랍(localStorage)에서 가져옴
  const [newEntries, setNewEntries] = useState(() => {
    const saved = localStorage.getItem('car_entries_draft');
    return saved ? JSON.parse(saved) : [{ car_type: '승용차', car_number: '', start_date: '', end_date: '', purpose: '' }];
  });

  // --- [효과 관리 (useEffect)] ---

  // 1. 자동 로그인: 앱 실행 시 서랍에서 유저 정보 확인
  useEffect(() => {
    const savedUser = localStorage.getItem('car_user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  // 2. 입력 내용 실시간 저장: newEntries가 바뀔 때마다 서랍에 저장
  useEffect(() => {
    localStorage.setItem('car_entries_draft', JSON.stringify(newEntries));
  }, [newEntries]);

  // 3. 데이터 로딩 및 실시간 구독
  useEffect(() => {
    fetchCars();
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, fetchCars)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // --- [주요 로직 함수] ---

  const fetchCars = async () => {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('id', { ascending: false });
      if (error) throw error;
      setAllCars(data || []);
    } catch (error) { console.error("로딩 실패:", error); }
  };

  const sendTelegramNotification = async (entries) => {
    const BOT_TOKEN = '7770829732:AAE7OMJeNJQ-Qmf6gmpqK9_xXLfWCiQyC00';
    const CHAT_ID = '7405133698';
    const message = `🔔 [신규 차량 신청 알림]\n\n` + 
      entries.map(e => `🚗 번호: ${e.car_number}\n📍 차종: ${e.car_type}`).join('\n\n') +
      `\n\n관리자 확인: https://car-system-l5m1.onrender.com/`;

    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: message }),
      });
    } catch (err) { console.error("알림 실패:", err); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('users_profiles')
        .select('*')
        .eq('username', loginInput.username)
        .eq('password', loginInput.password)
        .single();

      if (error || !data) {
        if(loginInput.username === 'admin' && loginInput.password === '1234') {
          const adminUser = { username: '관리자', role: 'admin' };
          localStorage.setItem('car_user', JSON.stringify(adminUser)); // 자동 로그인용 저장
          setUser(adminUser);
          setActiveTab('status');
          return;
        }
        alert("로그인 정보가 올바르지 않습니다.");
        return;
      }
      localStorage.setItem('car_user', JSON.stringify(data)); // 자동 로그인용 저장
      setUser(data);
      setActiveTab(data.role === 'applicant' ? 'apply' : 'status');
    } catch (error) { alert("로그인 중 오류 발생"); }
  };

  const handleLogout = () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      localStorage.removeItem('car_user'); // 자동 로그인 해제
      setUser(null);
    }
  };

  const deleteCar = async (id) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
      alert("삭제되었습니다.");
      fetchCars();
    } catch (error) { alert("삭제 실패"); }
  };

  // --- [날짜/포맷 유틸리티] ---
  const toSqlDate = (val) => {
    if (!val) return null;
    let d = val instanceof Date ? val : new Date(String(val).replaceAll('.', '-').trim());
    if (isNaN(d.getTime())) return null;
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const formatAccessPeriod = (start, end) => {
    if (!start || !end) return '상시';
    const s = start.split('T')[0];
    const e = end.split('T')[0];
    return e >= '2050-12-31' ? `${s} ~ 상시` : `${s} ~ ${e}`;
  };

  const handleExcelUpload = (e) => { /* ... 기존 엑셀 업로드 로직 동일 ... */ };

  // --- [UI 렌더링] ---
  if (!user) {
    return (
      <div className="flex justify-center items-center bg-gray-100 min-h-screen p-4 text-center">
        <div className="max-w-md w-full h-[850px] max-h-[95vh] bg-white flex flex-col items-center shadow-2xl relative rounded-[40px] overflow-hidden border-[8px] border-white font-nanumRound">
          <div className="mt-12 w-full flex justify-center px-12">
            <img src="/logo.png" alt="Logo" className="h-8 w-auto object-contain" />
          </div>
          <div className="mt-10">
            <h1 className="text-[24px] font-black text-gray-900 leading-tight mb-1">제3매립장(1단계)</h1>
            <p className="text-base font-bold text-gray-600">차량 출입관리 시스템</p>
          </div>
          <form onSubmit={handleLogin} className="w-full px-10 mt-10 z-10 space-y-4 text-left">
            <input type="text" placeholder="아이디" className="w-full p-4 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              onChange={e => setLoginInput({...loginInput, username: e.target.value})} />
            <input type="password" placeholder="비밀번호" className="w-full p-4 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              onChange={e => setLoginInput({...loginInput, password: e.target.value})} />
            <button className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg mt-4 active:scale-95 transition-all">로그인하기</button>
          </form>
          <div className="mt-auto w-full flex justify-center pb-8">
            <img src="/character.png" alt="Character" className="w-[70%] max-h-52 object-contain" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center bg-gray-200 min-h-screen font-nanumRound">
      <div className="max-w-md w-full h-screen bg-gray-50 relative flex flex-col shadow-2xl overflow-hidden">
        
        <header className="relative h-28 shrink-0 flex flex-col justify-between p-5 overflow-hidden bg-white"
          style={{ backgroundImage: "url('/main.png')", backgroundSize: 'cover', backgroundPosition: 'left center' }}>
          <div className="relative z-10 flex justify-end mt-1">
            <h1 className="text-[16px] font-black text-[#2563eb] drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">제3매립장 차량관리 시스템</h1>
          </div>
          <div className="relative z-10 flex justify-end items-center gap-2">
            <div className="bg-white/70 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-white/20 text-[10px] text-blue-800 font-black">
              관리권한: {user.role === 'admin' ? '관리자' : '사용자'}
            </div>
            <button onClick={handleLogout} className="bg-gray-100/50 text-[10px] font-black text-gray-500 border border-gray-200 px-2.5 py-0.5 rounded-full">로그아웃</button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-3 pb-32">
          {activeTab === 'status' && (
            <div className="space-y-3">
              <div className="relative mb-2">
                <input type="text" maxLength="4" placeholder="차량번호 뒤 4자리 검색" className="w-full h-12 p-5 pl-12 bg-white border-none rounded-2xl shadow-sm text-base font-black outline-none ring-2 ring-gray-50 focus:ring-blue-400" onChange={(e) => setSearchQuery(e.target.value)} />
                <span className="absolute left-5 top-3.5 text-lg opacity-20">🔍</span>
              </div>
              <div className="grid gap-2">
                {allCars.filter(car => car.status === 'approved' && (searchQuery === '' || car.car_number.endsWith(searchQuery))).map((car, idx) => (
                  <div key={car.id} className="bg-white h-14 px-4 rounded-xl border border-white shadow-sm flex items-center gap-3 animate-fadeIn">
                    <div className="flex-none w-7 h-7 bg-[#2563eb] rounded-full flex items-center justify-center font-black text-white text-[12px]">{idx + 1}</div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-[15px] font-black text-gray-800 leading-none truncate">{car.car_number}</p>
                      <p className="text-[10px] font-bold text-gray-400 mt-1 truncate">{car.purpose}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                      {formatAccessPeriod(car.start_date, car.end_date)}
                    </div>
                    {user.role === 'admin' && (
                      <button onClick={() => deleteCar(car.id)} className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-all">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'apply' && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-gray-800 px-1">방문 신청서</h2>
              {newEntries.map((entry, idx) => (
                <div key={idx} className="bg-white p-5 rounded-3xl shadow-sm space-y-4 border border-white">
                  <div className="grid grid-cols-2 gap-3 text-sm font-bold">
                    <input type="text" placeholder="차종" value={entry.car_type} className="w-full p-3 bg-gray-50 border-none rounded-xl" onChange={e => { const n = [...newEntries]; n[idx].car_type = e.target.value; setNewEntries(n); }} />
                    <input type="text" placeholder="차량번호" value={entry.car_number} className="w-full p-3 bg-gray-50 border-none rounded-xl" onChange={e => { const n = [...newEntries]; n[idx].car_number = e.target.value; setNewEntries(n); }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                    <input type="date" value={entry.start_date} className="w-full p-3 bg-gray-50 border-none rounded-xl" onChange={e => { const n = [...newEntries]; n[idx].start_date = e.target.value; setNewEntries(n); }} />
                    <input type="date" value={entry.end_date} className="w-full p-3 bg-gray-50 border-none rounded-xl" onChange={e => { const n = [...newEntries]; n[idx].end_date = e.target.value; setNewEntries(n); }} />
                  </div>
                  <textarea placeholder="출입 사유" value={entry.purpose} className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm font-bold" rows="2" onChange={e => { const n = [...newEntries]; n[idx].purpose = e.target.value; setNewEntries(n); }} />
                </div>
              ))}
              <button onClick={async () => {
                try {
                  const validEntries = newEntries.filter(e => e.car_number.trim());
                  if (validEntries.length === 0) return alert("번호를 입력하세요.");
                  const inserts = validEntries.map(e => ({ ...e, status: 'pending', applicant: user.username }));
                  
                  const { error } = await supabase.from('vehicles').insert(inserts);
                  if (error) throw error;

                  alert("신청 완료! 관리자에게 알림이 전송되었습니다.");
                  
                  // 신청 성공 시 데이터 초기화 및 서랍 비우기
                  localStorage.removeItem('car_entries_draft');
                  setNewEntries([{ car_type: '승용차', car_number: '', start_date: '', end_date: '', purpose: '' }]);
                  
                  fetchCars(); 
                  setActiveTab('status');
                  sendTelegramNotification(inserts); // 백그라운드 전송
                } catch (err) { alert("저장 실패"); }
              }} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg active:scale-95 transition-all">신청서 제출</button>
            </div>
          )}

          {activeTab === 'admin' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <h2 className="text-lg font-black text-gray-800">승인 대기함</h2>
                <span className="bg-blue-100 text-blue-600 text-[10px] font-black px-2.5 py-1 rounded-md">총 {allCars.filter(c => c.status === 'pending').length}건</span>
              </div>
              {allCars.filter(c => c.status === 'pending').map(car => (
                <div key={car.id} className="bg-white p-5 rounded-[30px] shadow-sm border border-gray-100 space-y-3 animate-fadeIn">
                  <div className="flex items-end gap-2 border-b border-gray-50 pb-2">
                    <p className="text-xl font-black text-gray-900 leading-none">{car.car_number}</p>
                    <p className="text-xs font-bold text-gray-400 mb-0.5">{car.car_type}</p>
                  </div>
                  <div className="text-sm font-black text-gray-700">기간: {formatAccessPeriod(car.start_date, car.end_date)}</div>
                  <div className="text-sm font-bold text-gray-500">목적: {car.purpose}</div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={async () => { await supabase.from('vehicles').update({status: 'approved'}).eq('id', car.id); fetchCars(); }} className="flex-1 bg-gray-900 text-white py-4 rounded-2xl font-black text-xs active:scale-95 transition-all">승인</button>
                    <button onClick={async () => { await supabase.from('vehicles').update({status: 'rejected'}).eq('id', car.id); fetchCars(); }} className="flex-1 bg-gray-50 text-gray-400 py-4 rounded-2xl font-black text-xs active:scale-95 transition-all">반려</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <nav className="fixed bottom-0 max-w-md w-full bg-white/95 backdrop-blur-xl border-t px-4 py-4 flex justify-around items-center rounded-t-[40px] shadow-2xl z-50">
          <button onClick={() => setActiveTab('status')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'status' ? "text-blue-500 scale-110" : "text-gray-200"}`}><span className="text-xl">🔍</span><span className="text-[9px] font-black">현황 조회</span></button>
          <button onClick={() => setActiveTab('apply')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'apply' ? "text-blue-500 scale-110" : "text-gray-200"}`}><span className="text-xl">📝</span><span className="text-[9px] font-black">차량 등록</span></button>
          {user.role === 'admin' && <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'admin' ? "text-blue-500 scale-110" : "text-gray-200"}`}><span className="text-xl">⚙️</span><span className="text-[9px] font-black">관리자</span></button>}
        </nav>
      </div>
      <style>{`
        @import url('https://hangeul.pstatic.net/hangeul_static/css/nanum-square-round.css');
        * { font-family: 'NanumSquareRound', sans-serif !important; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
