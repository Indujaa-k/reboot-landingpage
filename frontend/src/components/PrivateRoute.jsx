import { Navigate } from 'react-router-dom';

const PrivateRoute = ({ children }) => {
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo'));
  return adminInfo?.token ? children : <Navigate to="/login" replace />;
};

export default PrivateRoute;
