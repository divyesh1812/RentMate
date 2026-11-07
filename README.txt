RentMate v2
Folder layout:   Server.java   +   public/ (index.html, style.css, theme.css, app.js, features.js, logo.svg, images/products/)
1. Start MySQL (XAMPP). Import your rentmate.sql once (or let Server.java create the DB).
2. javac -cp ".;mysql-connector-j-26.7.0.jar" Server.java
3. java  -cp ".;mysql-connector-j-26.7.0.jar" Server        (Mac/Linux: use ':' instead of ';')
4. Open http://localhost:8080   -> login screen first. Admin: admin / admin123.  Customers: e.g. aarav@gmail.com / 12345
Server.java upgrades your tables automatically on first start (nothing is deleted).
