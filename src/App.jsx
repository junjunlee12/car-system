import React, { useState, useEffect } from 'react';
// 1. 라이브러리 교체
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// 2. Supabase 접속 정보 (아까 찾으신 값 입력)
const SUPABASE_URL = 'https://vafbgzrhxhkvuvfwehfk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iu4MZpgtwmVqEGc_gZjJOg_6m6yjUQz';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [user, setUser] = useState(null);
  const [loginInput, setLoginInput] = useState({ username: '', password: '' });
  const [activeTab, setActiveTab] = useState('status');
  const [searchQuery, setSearchQuery] = useState('');
  const [allCars, setAllCars] = useState([]);
  const [newEntries, setNewEntries] = useState([{ car_type: '', car_number: '', start_date: '', end_date: '', purpose: '' }]);

  // 3. 데이터 로딩 (Supabase 방식)
const fetchCars = async () => {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('id', { ascending: false }); // created_at 대신 id로 변경
      
      if (error) throw error;
      setAllCars(data || []);
    } catch (error) { 
      console.error("데이터 로딩 실패:", error); 
    }
  };

  // ✅ 여기에 sendTelegramNotification 함수를 넣으세요!
const sendTelegramNotification = async (entries) => {
  const BOT_TOKEN = '교수님의_봇_토큰';
  const CHAT_ID = '교수님의_ID';
  
  const message = `🚨 [출입 신청 발생]\n\n` + 
    entries.map(e => `📍 차종: ${e.car_type}\n🚗 번호: ${e.car_number}\n📝 목적: ${e.purpose}`).join('\n\n') +
    `\n\n관리자 확인: https://car-system-l5m1.onrender.com/`;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message }),
    });
  } catch (err) {
    console.error("텔레그램 전송 실패", err);
  }
};
  
  useEffect(() => {
    fetchCars();
    
    // 4. 실시간 업데이트 구독 (Supabase Realtime)
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, fetchCars)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // 5. 로그인 처리 (간편 로직: 테이블에 사용자 정보를 넣었을 경우)
  const handleLogin = async (e) => {
    e.preventDefault();
    // 실제 운영시에는 Supabase Auth를 쓰는 게 좋지만, 
    // 기존 흐름 유지를 위해 'users' 테이블을 조회하는 방식으로 구성합니다.
    try {
      const { data, error } = await supabase
        .from('users_profiles') // Supabase에 이 이름의 테이블을 만드셔야 합니다.
        .select('*')
        .eq('username', loginInput.username)
        .eq('password', loginInput.password)
        .single();

      if (error || !data) {
        // 임시: 관리자 계정 하드코딩 (테스트용)
        if(loginInput.username === 'admin' && loginInput.password === '1234') {
          setUser({ username: '관리자', role: 'admin' });
          setActiveTab('status');
          return;
        }
        alert("로그인 정보가 올바르지 않습니다.");
        return;
      }
      
      setUser(data);
      setActiveTab(data.role === 'applicant' ? 'apply' : 'status');
    } catch (error) { alert("로그인 중 오류 발생"); }
  };

  const handleLogout = () => {
    setUser(null);
  };

  const getRoleName = (role) => {
    if (role === 'admin') return '관리자';
    if (role === 'guard') return '통제자';
    if (role === 'applicant') return '등록자';
    return role;
  };

  // --- 날짜 처리 유틸리티 (Supabase date 타입에 맞춤) ---
  const parseLocalDate = (val) => {
    if (!val) return null;
    let cleaned = String(val).replaceAll('.', '-').trim();
    let d = new Date(cleaned);
    if (isNaN(d.getTime())) return null;
    return d;
  };

  // Supabase Date 타입은 'YYYY-MM-DD' 형식을 받습니다.
const toSqlDate = (val) => {
    if (!val) return null;
    
    let d;
    // 1. 이미 날짜 객체인 경우 (XLSX cellDates 옵션)
    if (val instanceof Date) {
      d = val;
    } else {
      // 2. 문자열인 경우
      let cleaned = String(val).replaceAll('.', '-').trim();
      d = new Date(cleaned);
    }

    if (isNaN(d.getTime())) return null;

    const pad = (n) => n.toString().padStart(2, '0');
    // Supabase Date 타입(YYYY-MM-DD)에 맞게 변환
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const formatAccessPeriod = (start, end) => {
    const dStart = parseLocalDate(start);
    const dEnd = parseLocalDate(end);
    if (!dStart || !dEnd) return '상시';
    const alwaysStartLimit = new Date('2026-01-01');
    const alwaysEndLimit = new Date('2050-12-31');
    if (dStart < alwaysStartLimit && dEnd >= alwaysEndLimit) return '상시';
    const pad = (n) => n.toString().padStart(2, '0');
    const getYYYYMMDD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const startStr = getYYYYMMDD(dStart);
    const endStr = dEnd >= alwaysEndLimit ? '상시' : getYYYYMMDD(dEnd);
    return `${startStr} ~ ${endStr}`;
  };

  // 6. 삭제 기능 (Supabase 방식)
  const deleteCar = async (id) => {
    if (!window.confirm("이 차량 기록을 정말 삭제하시겠습니까?")) return;
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
      alert("삭제되었습니다.");
      fetchCars();
    } catch (error) { alert("삭제 실패"); }
  };

  // 7. 엑셀 업로드 (Supabase 방식)
const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        // cellDates: true 옵션으로 엑셀 날짜를 자바스크립트 날짜로 직접 읽어옵니다.
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);

        console.log("읽어온 엑셀 데이터:", rawData); // 데이터 구조 확인용

        const uploadData = rawData.map((row, index) => {
          // 엑셀 헤더가 다를 수 있으므로 여러 경우의 수를 체크합니다.
          const startVal = row.start_date || row['시작일'] || row['출입시작'] || row['시작'];
          const endVal = row.end_date || row['종료일'] || row['출입종료'] || row['종료'];

          return {
            car_type: row.car_type || row['차종'] || '',
            car_number: row.car_number || row['차량번호'] || row['번호'] || '',
            start_date: toSqlDate(startVal),
            end_date: toSqlDate(endVal),
            purpose: row.purpose || row['출입목적'] || row['목적'] || '',
            status: 'approved', // 엑셀에 없어도 여기서 강제로 '승인' 상태로 넣음
            applicant: user.username
          };
        });

        console.log("최종 전송할 데이터:", uploadData);

        const { error } = await supabase.from('vehicles').insert(uploadData);
        if (error) {
          console.error("Supabase 저장 에러:", error);
          throw new Error("DB 저장 중 오류: " + error.message);
        }

        alert(`총 ${rawData.length}건이 성공적으로 업로드되었습니다.`);
        fetchCars();
      } catch (err) {
        console.error("상세 에러 내용:", err);
        alert(`엑셀 처리 중 오류 발생: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- UI 부분 (기존과 동일하되, 데이터 필드명 확인) ---
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
          <div className="w-full px-10 mt-10 z-10 text-left">
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="text" placeholder="아이디" className="w-full p-4 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                onChange={e => setLoginInput({...loginInput, username: e.target.value})} />
              <input type="password" placeholder="비밀번호" className="w-full p-4 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                onChange={e => setLoginInput({...loginInput, password: e.target.value})} />
              <button className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg mt-4 active:scale-95 transition-all">로그인하기</button>
            </form>
          </div>
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
        
        <header 
          className="relative h-28 shrink-0 flex flex-col justify-between p-5 overflow-hidden bg-white"
          style={{ backgroundImage: "url('/main.png')", backgroundSize: 'cover', backgroundPosition: 'left center', backgroundRepeat: 'no-repeat' }}
        >
          <div className="relative z-10 flex justify-end mt-1">
            <h1 className="text-[16px] font-black text-[#2563eb] whitespace-nowrap tracking-tighter drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">
              제3매립장(1단계) 출입 차량관리 시스템
            </h1>
          </div>
          <div className="relative z-10 flex justify-end items-center gap-2 mb-0">
            <div className="bg-white/70 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-white/20">
              <p className="text-[10px] text-blue-800 font-black">상태: <span className="text-blue-600">{getRoleName(user.role)}</span></p>
            </div>
            <button onClick={handleLogout} className="bg-gray-100/50 backdrop-blur-sm text-[10px] font-black text-gray-500 border border-gray-200 px-2.5 py-0.5 rounded-full">로그아웃</button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-3 pb-32">
          {activeTab === 'status' && (
            <div className="space-y-3">
              <div className="relative mb-2">
                <input type="text" maxLength="4" placeholder="차량번호 뒤 4자리 입력" className="w-full h-12 p-5 pl-12 bg-white border-none rounded-2xl shadow-sm text-base font-black outline-none ring-2 ring-gray-50 focus:ring-blue-400" onChange={(e) => setSearchQuery(e.target.value)} />
                <span className="absolute left-5 top-3.5 text-lg opacity-20">🔍</span>
              </div>
              <div className="grid gap-2">
                {allCars.filter(car => car.status === 'approved' && (searchQuery === '' || car.car_number.endsWith(searchQuery))).map((car, index) => (
                  <div key={car.id} className="bg-white h-14 px-4 rounded-xl border border-white shadow-sm flex items-center gap-3 animate-fadeIn">
                    <div className="flex-none w-7 h-7 bg-[#2563eb] rounded-full flex items-center justify-center font-black text-white text-[12px] shadow-sm">{index + 1}</div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-[15px] font-black text-gray-800 leading-none truncate">{car.car_number}</p>
                      <p className="text-[10px] font-bold text-gray-400 mt-1 truncate">{car.purpose}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                        {formatAccessPeriod(car.start_date, car.end_date)}
                      </p>
                      {user.role === 'admin' && (
                        <button onClick={() => deleteCar(car.id)} className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-all active:scale-90">✕</button>
                      )}
                    </div>
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
                    <input type="text" placeholder="차종" className="w-full p-3 bg-gray-50 border-none rounded-xl" onChange={e => { const n = [...newEntries]; n[idx].car_type = e.target.value; setNewEntries(n); }} />
                    <input type="text" placeholder="차량번호" className="w-full p-3 bg-gray-50 border-none rounded-xl" onChange={e => { const n = [...newEntries]; n[idx].car_number = e.target.value; setNewEntries(n); }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                    <input type="date" className="w-full p-3 bg-gray-50 border-none rounded-xl" onChange={e => { const n = [...newEntries]; n[idx].start_date = e.target.value; setNewEntries(n); }} />
                    <input type="date" className="w-full p-3 bg-gray-50 border-none rounded-xl" onChange={e => { const n = [...newEntries]; n[idx].end_date = e.target.value; setNewEntries(n); }} />
                  </div>
                  <textarea placeholder="출입 사유" className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm font-bold" rows="2" onChange={e => { const n = [...newEntries]; n[idx].purpose = e.target.value; setNewEntries(n); }} />
                </div>
              ))}
              <button onClick={async () => {
                try {
                  const inserts = newEntries.filter(e => e.car_number).map(e => ({ ...e, status: 'pending', applicant: user.username }));
                  const { error } = await supabase.from('vehicles').insert(inserts);
                  if (error) throw error;

// 2. ✅ 여기서 텔레그램 함수를 호출합니다!
      await sendTelegramNotification(inserts);

                  alert("신청이 완료되었습니다. 관리자에게 알림이 전송되었습니다."); fetchCars(); setActiveTab('status');
                } catch (err) { alert("신청 중 오류가 발생했습니다."); }
              }} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg">신청서 제출</button>
            </div>
          )}


          {activeTab === 'admin' && (
            <div className="space-y-4 text-left">
              <div className="flex justify-between items-center px-1">
                <h2 className="text-lg font-black text-gray-800">승인 대기함</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => document.getElementById('excelInput').click()} className="bg-white/70 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-gray-200 text-[10px] text-blue-600 font-black hover:bg-blue-50 transition-all">일괄 업로드</button>
                  <input id="excelInput" type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelUpload} />
                  <span className="bg-blue-100 text-blue-600 text-[10px] font-black px-2.5 py-1 rounded-md">총 {allCars.filter(c => c.status === 'pending').length}건</span>
                </div>
              </div>
              {allCars.filter(c => c.status === 'pending').map(car => (
                <div key={car.id} className="bg-white p-5 rounded-[30px] shadow-sm border border-gray-100 space-y-3 animate-fadeIn">
                  <div className="flex items-end gap-2 border-b border-gray-50 pb-2">
                    <p className="text-xl font-black text-gray-900 leading-none">{car.car_number}</p>
                    <p className="text-xs font-bold text-gray-400 mb-0.5">{car.car_type}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-blue-500 mb-1 uppercase tracking-wider">출입기간</p>
                    <p className="text-sm font-black text-gray-700">{formatAccessPeriod(car.start_date, car.end_date)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 mb-1 uppercase tracking-wider">출입목적</p>
                    <p className="text-sm font-bold text-gray-500">{car.purpose}</p>
                  </div>
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
          <button onClick={() => setActiveTab('status')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'status' ? "text-blue-500 scale-110" : "text-gray-200"}`}><span className="text-xl">🔍</span><span className="text-[9px] font-black uppercase">현황 조회</span></button>
          <button onClick={() => setActiveTab('apply')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'apply' ? "text-blue-500 scale-110" : "text-gray-200"}`}><span className="text-xl">📝</span><span className="text-[9px] font-black uppercase">차량 등록</span></button>
          {user.role === 'admin' && <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'admin' ? "text-blue-500 scale-110" : "text-gray-200"}`}><span className="text-xl">⚙️</span><span className="text-[9px] font-black uppercase tracking-tighter">관리자 탭</span></button>}
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
