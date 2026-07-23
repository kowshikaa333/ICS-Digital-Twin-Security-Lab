-- ICS Water Tank — SQL Server Schema
-- Compatible with: SQL Server 2016+, Azure SQL Database
-- Generated for: CuveRegulationAvancee / TK-001

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'TankSCADA')
  CREATE DATABASE TankSCADA;
GO

USE TankSCADA;
GO

-- ============================================================
-- Main readings table (time-series historian)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TankReadings') AND type = N'U')
BEGIN
  CREATE TABLE dbo.TankReadings (
    Id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    Timestamp       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    TankLevel       FLOAT          NOT NULL,  -- %  (0.00 - 100.00)
    Setpoint        FLOAT          NOT NULL,  -- %
    DeadBand        FLOAT          NOT NULL,  -- %
    Pressure        FLOAT          NOT NULL,  -- bar
    Temperature     FLOAT          NOT NULL,  -- °C
    FillPump        BIT            NOT NULL,
    DrainValve      BIT            NOT NULL,
    AlarmLowLevel   BIT            NOT NULL,
    AlarmHighLevel  BIT            NOT NULL,
    AutoMode        BIT            NOT NULL,
    ScanCount       BIGINT         NOT NULL DEFAULT 0
  );
END
GO

-- Clustered index on Timestamp for range queries
CREATE CLUSTERED INDEX IX_TankReadings_Timestamp
  ON dbo.TankReadings (Timestamp ASC);
GO

-- ============================================================
-- Alarm events table
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AlarmEvents') AND type = N'U')
BEGIN
  CREATE TABLE dbo.AlarmEvents (
    Id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    Timestamp   DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    Tag         NVARCHAR(50)  NOT NULL,
    AlarmType   NVARCHAR(20)  NOT NULL,  -- 'CRIT' | 'WARN' | 'INFO'
    Message     NVARCHAR(255) NOT NULL,
    Active      BIT           NOT NULL DEFAULT 1,
    Acknowledged BIT          NOT NULL DEFAULT 0,
    AcknowledgedAt DATETIME2(3) NULL,
    AcknowledgedBy NVARCHAR(100) NULL
  );
END
GO

-- ============================================================
-- State change log (audit trail)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.StateChangeLog') AND type = N'U')
BEGIN
  CREATE TABLE dbo.StateChangeLog (
    Id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    Timestamp   DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    Tag         NVARCHAR(50)  NOT NULL,
    OldValue    NVARCHAR(100) NULL,
    NewValue    NVARCHAR(100) NOT NULL,
    Source      NVARCHAR(50)  NOT NULL DEFAULT 'SCADA',  -- 'SCADA' | 'MODBUS' | 'MQTT' | 'API'
    OperatorId  NVARCHAR(100) NULL
  );
END
GO

-- ============================================================
-- Stored procedures
-- ============================================================

-- Insert a reading (called by gateway.js)
CREATE OR ALTER PROCEDURE dbo.InsertTankReading
  @TankLevel    FLOAT, @Setpoint FLOAT, @DeadBand FLOAT,
  @Pressure     FLOAT, @Temperature FLOAT,
  @FillPump     BIT,   @DrainValve BIT,
  @AlarmLow     BIT,   @AlarmHigh BIT,
  @AutoMode     BIT,   @ScanCount BIGINT
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO dbo.TankReadings
    (TankLevel,Setpoint,DeadBand,Pressure,Temperature,FillPump,DrainValve,AlarmLowLevel,AlarmHighLevel,AutoMode,ScanCount)
  VALUES
    (@TankLevel,@Setpoint,@DeadBand,@Pressure,@Temperature,@FillPump,@DrainValve,@AlarmLow,@AlarmHigh,@AutoMode,@ScanCount);
END
GO

-- Get last N readings (for Ignition / Kibana)
CREATE OR ALTER PROCEDURE dbo.GetRecentReadings
  @Count INT = 100
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP (@Count) * FROM dbo.TankReadings ORDER BY Timestamp DESC;
END
GO

-- Average level by hour (for Kibana dashboard)
CREATE OR ALTER VIEW dbo.vw_HourlyAverage AS
  SELECT
    DATEADD(HOUR, DATEDIFF(HOUR, 0, Timestamp), 0) AS [Hour],
    AVG(TankLevel)    AS AvgLevel,
    MAX(TankLevel)    AS MaxLevel,
    MIN(TankLevel)    AS MinLevel,
    AVG(Temperature)  AS AvgTemp,
    AVG(Pressure)     AS AvgPressure,
    SUM(CAST(AlarmLowLevel  AS INT)) AS LowAlarmCount,
    SUM(CAST(AlarmHighLevel AS INT)) AS HighAlarmCount
  FROM dbo.TankReadings
  GROUP BY DATEADD(HOUR, DATEDIFF(HOUR, 0, Timestamp), 0);
GO

PRINT 'TankSCADA schema created successfully.';
GO
