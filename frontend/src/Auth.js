import React, { useState } from 'react';

function Auth({ onLoginSuccess }) {
  // Trạng thái chuyển đổi giữa Đăng nhập (true) và Đăng ký (false)
  const [isLogin, setIsLogin] = useState(true);
  
  // Dữ liệu nhập vào từ form
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });

  // Xử lý khi người dùng nhấn nút Gửi form
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Chọn đúng endpoint API dựa trên chế độ hiện tại
    const endpoint = isLogin ? '/login' : '/register';
    
    try {
      const response = await fetch(`http://localhost:4000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        if (isLogin) {
          // Nếu đăng nhập thành công, gọi hàm callback để cập nhật App.js
          // Truyền cả username, display_name và total_point
          onLoginSuccess(data.username, data.display_name, data.total_point || 0);
        } else {
          // Nếu đăng ký thành công, thông báo và chuyển sang màn hình đăng nhập
          alert("Đăng ký tài khoản thành công! Bây giờ bạn có thể đăng nhập.");
          setIsLogin(true);
        }
      } else {
        // Hiển thị lỗi từ Backend (ví dụ: Sai mật khẩu, User đã tồn tại)
        alert(data.message || "Có lỗi xảy ra, vui lòng thử lại!");
      }
    } catch (error) {
      console.error("Auth Error:", error);
      alert("Không thể kết nối tới Server. Hãy chắc chắn Backend đang chạy!");
    }
  };

  return (
    <div className="mt-8 w-full max-w-sm animate-fadeIn">
      {/* Container chính với hiệu ứng Glassmorphism */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-8 rounded-3xl shadow-2xl transition-all">
        
        {/* Tab chuyển đổi Đăng nhập / Đăng ký */}
        <div className="flex justify-around mb-8 border-b border-slate-800/50 pb-4">
          <button 
            type="button"
            onClick={() => setIsLogin(true)}
            className={`font-black text-sm tracking-widest transition-all duration-300 ${
              isLogin ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            ĐĂNG NHẬP
          </button>
          <button 
            type="button"
            onClick={() => setIsLogin(false)}
            className={`font-black text-sm tracking-widest transition-all duration-300 ${
              !isLogin ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            ĐĂNG KÝ
          </button>
        </div>

        {/* Form nhập liệu */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="group">
            <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest group-focus-within:text-blue-400 transition-colors">
              Tài khoản
            </label>
            <input 
              type="text" 
              required
              autoComplete="username"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-white placeholder-slate-600"
              placeholder="Nhập tên đăng nhập..."
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
            />
          </div>

          <div className="group">
            <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest group-focus-within:text-blue-400 transition-colors">
              Mật khẩu
            </label>
            <input 
              type="password" 
              required
              autoComplete="current-password"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-white placeholder-slate-600"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          </div>
          
          {/* Nút xác nhận với hiệu ứng Gradient và Shadow */}
          <button 
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 py-4 rounded-xl font-black text-sm tracking-widest text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            {isLogin ? 'XÁC NHẬN ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN MỚI'}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] text-slate-500 italic">
          {isLogin ? "Bạn là chiến binh mới?" : "Đã có tài khoản?"}{" "}
          <span 
            className="text-blue-400 cursor-pointer hover:underline not-italic"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? "Đăng ký ngay" : "Quay lại đăng nhập"}
          </span>
        </p>
      </div>
    </div>
  );
}

export default Auth;