import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import './Dashboard.css';

const Dashboard = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const adminInfo = JSON.parse(localStorage.getItem('adminInfo'));

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data } = await api.get('/users');
        setUsers(data);
      } catch (err) {
        if (err.response?.status === 401) {
          handleLogout();
        } else {
          setError(err.response?.data?.message || 'Failed to load users.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminInfo');
    navigate('/login');
  };

  return (
    <div className="dash-screen">
      <header className="dash-header">
        <div>
          <span className="dash-brand-mark">◆</span>
          <span className="dash-brand-name">CONSOLE</span>
        </div>
        <div className="dash-header-right">
          <span className="dash-admin-name">{adminInfo?.username}</span>
          <button className="dash-logout" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-title-row">
          <h1>Users</h1>
          <span className="dash-count">{users.length} total</span>
        </div>

        {loading && <p className="dash-status">Loading users…</p>}
        {error && <p className="dash-status dash-status-error">{error}</p>}

        {!loading && !error && (
          users.length === 0 ? (
            <p className="dash-status">No users yet.</p>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>{u.phone || '—'}</td>
                      <td>
                        <span className={`dash-badge ${u.status === 'active' ? 'dash-badge-active' : 'dash-badge-inactive'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </main>
    </div>
  );
};

export default Dashboard;
