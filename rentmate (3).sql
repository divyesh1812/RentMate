-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 27, 2026 at 12:09 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `rentmate`
--

-- --------------------------------------------------------

--
-- Table structure for table `admins`
--

CREATE TABLE `admins` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `admins`
--

INSERT INTO `admins` (`id`, `name`, `username`, `password`) VALUES
(1, 'Main Admin', 'admin', 'admin123');

-- --------------------------------------------------------

--
-- Table structure for table `products`
--

CREATE TABLE `products` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `category` varchar(100) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `seller_id` int(11) NOT NULL,
  `status` varchar(20) DEFAULT 'PENDING',
  `available` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`id`, `name`, `category`, `price`, `seller_id`, `status`, `available`) VALUES
(1, 'Canon DSLR Camera', 'Camera', 800.00, 3, 'Available', 1),
(2, 'HP Laptop', 'Electronics', 1200.00, 4, 'Available', 1),
(3, 'Mountain Bicycle', 'Sports', 400.00, 5, 'Available', 1),
(4, 'Projector', 'Electronics', 700.00, 6, 'Available', 1),
(5, 'Camping Tent', 'Outdoor', 350.00, 7, 'Available', 1),
(6, 'Gaming Keyboard', 'Accessories', 200.00, 3, 'Available', 1),
(7, 'Electric Drill', 'Tools', 300.00, 4, 'Available', 1),
(8, 'Tripod Stand', 'Camera', 150.00, 5, 'Available', 1),
(29, 'GoPro Action Camera', 'Camera', 650.00, 23, 'Available', 1),
(30, 'MacBook Air', 'Laptop', 1800.00, 24, 'Available', 1),
(31, 'Skateboard', 'Sports', 250.00, 25, 'Available', 1),
(32, 'LED TV 43 Inch', 'Electronics', 900.00, 26, 'Available', 1),
(33, 'Sleeping Bag', 'Outdoor', 180.00, 27, 'Available', 1),
(34, 'Wireless Headphones', 'Audio', 300.00, 28, 'Available', 1),
(35, 'Cordless Screwdriver', 'Tools', 270.00, 23, 'Available', 1),
(36, 'Ring Light', 'Photography', 220.00, 24, 'Available', 1),
(37, 'Badminton Racket', 'Sports', 160.00, 25, 'Available', 1),
(38, 'Drone Camera', 'Camera', 1100.00, 26, 'Available', 1),
(39, 'Whiteboard', 'Office', 140.00, 27, 'Available', 1),
(40, 'Extension Board', 'Electronics', 100.00, 28, 'Available', 1),
(41, 'Bluetooth Microphone', 'Audio', 450.00, 23, 'Available', 1),
(42, 'Study Chair', 'Furniture', 200.00, 24, 'Available', 1),
(43, 'Mini Fridge', 'Appliances', 750.00, 25, 'Available', 1),
(44, 'Keyboard and Mouse Set', 'Computer', 180.00, 26, 'Available', 1),
(45, 'Projector Screen', 'Events', 300.00, 27, 'Available', 1),
(46, 'Picnic Mat', 'Outdoor', 120.00, 28, 'Available', 1),
(47, 'Electric Kettle', 'Appliances', 150.00, 23, 'Available', 1),
(48, 'Party Lights', 'Events', 280.00, 24, 'Available', 1);

-- --------------------------------------------------------

--
-- Table structure for table `rentals`
--

CREATE TABLE `rentals` (
  `id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `seller_id` int(11) NOT NULL,
  `start_date` date NOT NULL,
  `due_date` date NOT NULL,
  `return_date` date DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` varchar(20) DEFAULT 'ACTIVE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `rentals`
--

INSERT INTO `rentals` (`id`, `product_id`, `customer_id`, `seller_id`, `start_date`, `due_date`, `return_date`, `amount`, `status`) VALUES
(1, 1, 2, 3, '2026-09-01', '2026-09-03', '2026-09-03', 1600.00, 'Returned'),
(2, 3, 4, 5, '2026-09-02', '2026-09-05', '2026-09-05', 1200.00, 'Returned'),
(3, 4, 2, 6, '2026-09-05', '2026-09-07', NULL, 1400.00, 'Active'),
(10, 29, 2, 23, '2026-08-20', '2026-08-22', '2026-08-22', 1300.00, 'Returned'),
(11, 31, 24, 25, '2026-08-24', '2026-08-27', '2026-08-27', 750.00, 'Returned'),
(12, 34, 25, 28, '2026-09-01', '2026-09-03', NULL, 600.00, 'Active'),
(13, 38, 2, 26, '2026-09-04', '2026-09-06', NULL, 2200.00, 'Active'),
(14, 42, 26, 24, '2026-08-15', '2026-08-18', '2026-08-18', 600.00, 'Returned'),
(15, 47, 23, 23, '2026-08-28', '2026-08-30', '2026-08-30', 300.00, 'Returned');

-- --------------------------------------------------------

--
-- Table structure for table `transactions`
--

CREATE TABLE `transactions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `rental_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `type` varchar(50) DEFAULT NULL,
  `transaction_date` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `transactions`
--

INSERT INTO `transactions` (`id`, `user_id`, `rental_id`, `amount`, `type`, `transaction_date`) VALUES
(1, 2, 1, 1600.00, 'Rental Payment', '2026-08-31 18:30:00'),
(2, 4, 2, 1200.00, 'Rental Payment', '2026-09-01 18:30:00'),
(3, 2, 3, 1400.00, 'Rental Payment', '2026-09-04 18:30:00'),
(10, 2, 10, 1300.00, 'Rental Payment', '2026-08-19 18:30:00'),
(11, 24, 11, 750.00, 'Rental Payment', '2026-08-23 18:30:00'),
(12, 25, 12, 600.00, 'Rental Payment', '2026-08-31 18:30:00'),
(13, 2, 13, 2200.00, 'Rental Payment', '2026-09-03 18:30:00'),
(14, 26, 14, 600.00, 'Rental Payment', '2026-08-14 18:30:00'),
(15, 23, 15, 300.00, 'Rental Payment', '2026-08-27 18:30:00');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `password` varchar(100) NOT NULL,
  `wallet` decimal(10,2) DEFAULT 5000.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `phone`, `password`, `wallet`) VALUES
(2, 'Aarav Chaudhary', 'aarav@gmail.com', '1234567890', '12345', 5000.00),
(3, 'Rahul Sharma', 'rahul@gmail.com', '9876543210', '12345', 3000.00),
(4, 'Priya Patel', 'priya@gmail.com', '9823456781', '12345', 4500.00),
(5, 'Rohan Mehta', 'rohan@gmail.com', '9765432109', '12345', 2500.00),
(6, 'Sneha Joshi', 'sneha@gmail.com', '9898765432', '12345', 5000.00),
(7, 'Vivek Shah', 'vivek@gmail.com', '9812345678', '12345', 3500.00),
(23, 'Aditya Kulkarni', 'aditya.kulkarni@gmail.com', '9001122334', '12345', 2800.00),
(24, 'Neha Desai', 'neha.desai@gmail.com', '9002233445', '12345', 4200.00),
(25, 'Kunal Verma', 'kunal.verma@gmail.com', '9003344556', '12345', 3600.00),
(26, 'Isha Kapoor', 'isha.kapoor@gmail.com', '9004455667', '12345', 5100.00),
(27, 'Manav Jain', 'manav.jain@gmail.com', '9005566778', '12345', 2300.00),
(28, 'Tanya Singh', 'tanya.singh@gmail.com', '9006677889', '12345', 3900.00);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admins`
--
ALTER TABLE `admins`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Indexes for table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD KEY `seller_id` (`seller_id`);

--
-- Indexes for table `rentals`
--
ALTER TABLE `rentals`
  ADD PRIMARY KEY (`id`),
  ADD KEY `product_id` (`product_id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `seller_id` (`seller_id`);

--
-- Indexes for table `transactions`
--
ALTER TABLE `transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `rental_id` (`rental_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admins`
--
ALTER TABLE `admins`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `products`
--
ALTER TABLE `products`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=49;

--
-- AUTO_INCREMENT for table `rentals`
--
ALTER TABLE `rentals`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `transactions`
--
ALTER TABLE `transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=29;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `products`
--
ALTER TABLE `products`
  ADD CONSTRAINT `products_ibfk_1` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `rentals`
--
ALTER TABLE `rentals`
  ADD CONSTRAINT `rentals_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  ADD CONSTRAINT `rentals_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `rentals_ibfk_3` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `transactions`
--
ALTER TABLE `transactions`
  ADD CONSTRAINT `transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `transactions_ibfk_2` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
