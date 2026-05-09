# Requirements Document

## Introduction

本文档定义了在现有垃圾桶租赁管理系统中添加砖块配送业务类型的需求。该功能将使系统能够同时管理两种独立的业务类型：垃圾桶租赁和砖块配送。砖块配送业务涉及从砖厂取砖、在公司场地存储、以及向客户配送的完整流程。

## Glossary

- **System**: 垃圾桶租赁管理系统（现有系统）
- **Business_Type**: 业务类型，包括垃圾桶租赁（garbage）和砖块配送（brick）
- **Brick_Order**: 砖块配送订单
- **Brick_Order_Type**: 砖块订单类型，包括从砖厂取砖（pickup_from_factory）和送砖给客户（delivery_to_customer）
- **Brick_Factory**: 砖厂，砖块的来源地点
- **Company_Yard**: 公司场地，用于存储从砖厂取来的砖块
- **Customer_Address**: 客户地址，砖块的最终配送目的地
- **Driver**: 司机，执行取砖和送砖任务的人员
- **Order_List**: 订单列表页面（OrdersPage）
- **Map_View**: 地图视图页面（FleetMapPage）
- **Dispatch_View**: 调度视图页面（DispatchPage）
- **Create_Order_Page**: 创建订单页面
- **Reports_Page**: 报表页面
- **Brick_Locations_Page**: 砖厂和场地管理页面，用于管理砖厂和公司场地信息
- **Business_Type_Selector**: 业务类型切换器，用于在不同业务类型之间切换的UI组件
- **Brick_Workflow**: 砖块业务工作流，包括从砖厂取砖、存储到场地、从场地送砖给客户的完整流程
- **Garbage_Workflow**: 垃圾桶业务工作流，现有的垃圾桶租赁业务流程
- **Inventory_Count**: 库存数量，记录每个公司场地的当前砖块数量

## Requirements

### Requirement 1: 业务类型数据模型

**User Story:** 作为系统管理员，我希望系统能够区分和存储不同的业务类型，以便独立管理垃圾桶租赁和砖块配送业务。

#### Acceptance Criteria

1. THE System SHALL support a Business_Type enumeration with values 'garbage' and 'brick'
2. THE System SHALL store Business_Type for each order in the database
3. THE System SHALL default new orders to 'garbage' Business_Type for backward compatibility
4. WHEN a Brick_Order is created, THE System SHALL set Business_Type to 'brick'
5. THE System SHALL maintain data integrity by enforcing Business_Type constraints at the database level

### Requirement 2: 砖块配送订单类型定义

**User Story:** 作为业务分析师，我希望明确定义砖块配送的两种订单类型，以便系统能够正确处理从砖厂取砖和向客户送砖的不同场景。

#### Acceptance Criteria

1. THE System SHALL support two distinct Brick_Order_Type values: 'pickup_from_factory' and 'delivery_to_customer'
2. WHEN a Brick_Order is created with Brick_Order_Type 'pickup_from_factory', THE System SHALL require selection of a Brick_Factory as origin and a Company_Yard as destination
3. WHEN a Brick_Order is created with Brick_Order_Type 'delivery_to_customer', THE System SHALL require selection of a Company_Yard as origin and a Customer_Address as destination
4. WHEN a 'pickup_from_factory' order is completed, THE System SHALL increment the Inventory_Count at the destination Company_Yard
5. WHEN a 'delivery_to_customer' order is completed, THE System SHALL decrement the Inventory_Count at the source Company_Yard
6. THE System SHALL display the Brick_Order_Type clearly in all views where Brick_Orders are shown
7. THE System SHALL generate appropriate job steps based on the Brick_Order_Type
8. THE System SHALL validate that a Company_Yard has sufficient Inventory_Count before allowing creation of 'delivery_to_customer' orders

### Requirement 3: 业务类型切换UI组件

**User Story:** 作为员工用户，我希望在主要页面上能够切换业务类型，以便查看和管理不同业务的数据。

#### Acceptance Criteria

1. THE Business_Type_Selector SHALL be displayed on Order_List, Map_View, and Dispatch_View pages
2. THE Business_Type_Selector SHALL allow users to select between 'garbage' and 'brick' business types
3. WHEN a user selects a Business_Type, THE System SHALL persist the selection in browser local storage
4. WHEN a user navigates between pages, THE System SHALL maintain the selected Business_Type
5. THE Business_Type_Selector SHALL display a clear visual indicator of the currently selected business type
6. THE Business_Type_Selector SHALL be positioned consistently across all pages where it appears

### Requirement 4: 订单列表页面业务类型过滤和UI增强

**User Story:** 作为员工用户，我希望订单列表页面能够根据选择的业务类型显示相应的订单和相关列，以便专注于特定业务的订单管理。

#### Acceptance Criteria

1. THE Order_List SHALL display a Business_Type_Selector component at the top of the page
2. WHEN Business_Type is set to 'garbage', THE Order_List SHALL display only orders with Business_Type 'garbage'
3. WHEN Business_Type is set to 'brick', THE Order_List SHALL display only orders with Business_Type 'brick'
4. THE Order_List SHALL update immediately when Business_Type_Selector value changes
5. WHEN Business_Type is 'brick', THE Order_List SHALL display columns for Brick_Order_Type, origin location, destination location, and customer address
6. WHEN Business_Type is 'garbage', THE Order_List SHALL display columns for bin number, bin size, bin type, and service type
7. WHEN Business_Type is 'brick' and Brick_Order_Type is 'pickup_from_factory', THE Order_List SHALL display the Brick_Factory name and Company_Yard name
8. WHEN Business_Type is 'brick' and Brick_Order_Type is 'delivery_to_customer', THE Order_List SHALL display the Company_Yard name and Customer_Address
9. THE Business_Type_Selector SHALL persist the selected value in browser local storage
10. THE Business_Type_Selector SHALL be visually prominent with clear labels for 'garbage' and 'brick' options

### Requirement 5: 地图视图业务类型过滤和位置标记

**User Story:** 作为调度员，我希望地图视图能够根据选择的业务类型显示相应的订单和位置标记，以便可视化管理特定业务的地理分布。

#### Acceptance Criteria

1. THE Map_View SHALL display a Business_Type_Selector component at the top of the page
2. WHEN Business_Type is set to 'garbage', THE Map_View SHALL display only markers for orders with Business_Type 'garbage'
3. WHEN Business_Type is set to 'brick', THE Map_View SHALL display only markers for orders with Business_Type 'brick'
4. WHEN Business_Type is 'brick', THE Map_View SHALL display distinct markers for all active Brick_Factory locations
5. WHEN Business_Type is 'brick', THE Map_View SHALL display distinct markers for all active Company_Yard locations
6. THE Map_View SHALL use different marker icons for Brick_Factory (factory icon), Company_Yard (warehouse icon), and Customer_Address (customer icon) locations
7. THE Map_View SHALL use different marker colors for Brick_Factory (blue), Company_Yard (green), and Customer_Address (orange)
8. THE Map_View SHALL update immediately when Business_Type_Selector value changes
9. WHEN a user clicks on a Brick_Factory marker, THE Map_View SHALL display a popup with factory name and address
10. WHEN a user clicks on a Company_Yard marker, THE Map_View SHALL display a popup with yard name, address, and current Inventory_Count
11. THE Business_Type_Selector SHALL maintain the same selected value as other pages

### Requirement 6: 调度视图业务类型过滤和任务分配

**User Story:** 作为调度员，我希望调度视图能够根据选择的业务类型显示相应的任务分配，以便独立管理不同业务的司机调度。

#### Acceptance Criteria

1. THE Dispatch_View SHALL display a Business_Type_Selector component at the top of the page
2. WHEN Business_Type is set to 'garbage', THE Dispatch_View SHALL display only dispatch assignments for orders with Business_Type 'garbage'
3. WHEN Business_Type is set to 'brick', THE Dispatch_View SHALL display only dispatch assignments for orders with Business_Type 'brick'
4. THE Dispatch_View SHALL update immediately when Business_Type_Selector value changes
5. WHEN Business_Type is 'brick', THE Dispatch_View SHALL display job steps specific to Brick_Workflow
6. WHEN Business_Type is 'brick', THE Dispatch_View SHALL show Brick_Order_Type for each order card
7. WHEN Business_Type is 'brick' and Brick_Order_Type is 'pickup_from_factory', THE Dispatch_View SHALL display origin as Brick_Factory name and destination as Company_Yard name
8. WHEN Business_Type is 'brick' and Brick_Order_Type is 'delivery_to_customer', THE Dispatch_View SHALL display origin as Company_Yard name and destination as Customer_Address
9. THE Dispatch_View SHALL allow creating new dispatch assignments for the currently selected Business_Type
10. THE Dispatch_View SHALL allow drag-and-drop assignment of orders to drivers regardless of Business_Type
11. THE Business_Type_Selector SHALL maintain the same selected value as other pages

### Requirement 7: 砖块订单创建表单扩展

**User Story:** 作为员工用户，我希望创建订单页面能够支持创建砖块配送订单，以便记录和管理砖块业务的客户需求。

#### Acceptance Criteria

1. THE Create_Order_Page SHALL display a Business_Type_Selector to choose between 'garbage' and 'brick' order types
2. WHEN Business_Type is set to 'brick', THE Create_Order_Page SHALL display a Brick_Order_Type selector with options 'pickup_from_factory' and 'delivery_to_customer'
3. WHEN Brick_Order_Type is 'pickup_from_factory', THE form SHALL display a dropdown to select a Brick_Factory as origin
4. WHEN Brick_Order_Type is 'pickup_from_factory', THE form SHALL display a dropdown to select a Company_Yard as destination
5. WHEN Brick_Order_Type is 'delivery_to_customer', THE form SHALL display a dropdown to select a Company_Yard as origin
6. WHEN Brick_Order_Type is 'delivery_to_customer', THE form SHALL display an address input field for Customer_Address as destination
7. WHEN Brick_Order_Type is 'delivery_to_customer', THE form SHALL validate that the selected Company_Yard has Inventory_Count greater than zero
8. WHEN Brick_Order_Type is 'delivery_to_customer', THE form SHALL display the current Inventory_Count of the selected Company_Yard
9. THE form SHALL include fields for customer name, phone number, service date, time window, and delivery notes
10. WHEN a Brick_Order is submitted, THE System SHALL automatically set Business_Type to 'brick'
11. THE form SHALL hide bin-related fields (bin size, bin type) when Business_Type is 'brick'
12. THE form SHALL display appropriate field labels based on the selected Business_Type and Brick_Order_Type

### Requirement 8: 砖厂和场地位置管理

**User Story:** 作为系统管理员，我希望能够管理砖厂和公司场地的位置信息，以便在砖块业务中使用这些地点。

#### Acceptance Criteria

1. THE System SHALL provide a management interface for Brick_Factory locations
2. THE System SHALL provide a management interface for Company_Yard locations
3. WHEN adding a Brick_Factory, THE System SHALL require name, address, and geographic coordinates
4. WHEN adding a Company_Yard, THE System SHALL require name, address, geographic coordinates, and maximum storage capacity
5. THE System SHALL allow marking Brick_Factory and Company_Yard locations as active or inactive
6. THE System SHALL only display active locations in order creation forms and map views
7. THE System SHALL prevent deletion of locations that are referenced in existing orders

### Requirement 9: 砖块库存追踪

**User Story:** 作为仓库管理员，我希望系统能够追踪每个公司场地的砖块库存，以便了解可用的配送资源。

#### Acceptance Criteria

1. THE System SHALL maintain a brick inventory count for each Company_Yard
2. WHEN bricks are delivered to a Company_Yard from a Brick_Factory, THE System SHALL increment the yard's inventory count
3. WHEN bricks are picked up from a Company_Yard for customer delivery, THE System SHALL decrement the yard's inventory count
4. THE System SHALL prevent creating delivery orders from a Company_Yard when inventory count is zero
5. THE System SHALL display current inventory count for each Company_Yard in the management interface
6. THE System SHALL record inventory change history with timestamp, order reference, and quantity changed
7. THE System SHALL allow manual inventory adjustments with required reason notes

### Requirement 10: 司机应用业务类型支持

**User Story:** 作为司机，我希望司机应用能够显示我被分配的业务类型任务，以便我知道是执行垃圾桶业务还是砖块业务。

#### Acceptance Criteria

1. WHEN a Driver views their assigned tasks, THE System SHALL display the Business_Type for each task
2. WHEN a Driver views a Brick_Order task, THE System SHALL display job steps specific to Brick_Workflow
3. WHEN a Driver completes a brick pickup from factory step, THE System SHALL require photo upload and quantity confirmation
4. WHEN a Driver completes a brick delivery to yard step, THE System SHALL require photo upload and quantity confirmation
5. WHEN a Driver completes a brick pickup from yard step, THE System SHALL require photo upload and quantity confirmation
6. WHEN a Driver completes a brick delivery to customer step, THE System SHALL require photo upload, quantity confirmation, and customer signature
7. THE System SHALL display different step completion requirements based on Business_Type

### Requirement 11: 报表页面业务类型过滤

**User Story:** 作为管理者，我希望报表能够按业务类型分别统计和分析，以便评估每种业务的运营表现。

#### Acceptance Criteria

1. THE Reports_Page SHALL display a Business_Type_Selector component to filter reports
2. WHEN Business_Type is set to 'garbage', THE Reports_Page SHALL display only metrics and data for orders with Business_Type 'garbage'
3. WHEN Business_Type is set to 'brick', THE Reports_Page SHALL display only metrics and data for orders with Business_Type 'brick'
4. THE Reports_Page SHALL calculate business metrics separately for each Business_Type
5. THE Reports_Page SHALL display total order count, completed order count, and revenue by Business_Type
6. THE Reports_Page SHALL display driver performance metrics separately for each Business_Type
7. THE Reports_Page SHALL allow exporting reports with Business_Type filter applied
8. THE Business_Type_Selector SHALL maintain the same selected value as other pages

### Requirement 12: 数据迁移和向后兼容性

**User Story:** 作为系统管理员，我希望现有的垃圾桶业务数据能够平滑迁移，以便在添加砖块业务后不影响现有业务运营。

#### Acceptance Criteria

1. WHEN the Business_Type feature is deployed, THE System SHALL automatically set Business_Type to 'garbage' for all existing orders
2. THE System SHALL maintain all existing functionality for garbage business without modification
3. THE System SHALL ensure that existing API endpoints continue to work with default Business_Type 'garbage'
4. THE System SHALL provide a migration script to set Business_Type for historical data
5. WHEN Business_Type_Selector is not explicitly set, THE System SHALL default to 'garbage' business type
6. THE System SHALL ensure that existing user workflows are not disrupted by the addition of Business_Type

### Requirement 13: 砖厂和场地管理页面

**User Story:** 作为系统管理员，我希望有一个专门的页面来管理砖厂和公司场地信息，以便集中管理砖块业务的位置数据和库存信息。

#### Acceptance Criteria

1. THE System SHALL provide a Brick_Locations_Page accessible from the main navigation menu
2. THE Brick_Locations_Page SHALL display two separate sections: Brick_Factory management and Company_Yard management
3. THE Brick_Factory section SHALL display a table listing all Brick_Factory locations with columns for name, address, coordinates, and active status
4. THE Company_Yard section SHALL display a table listing all Company_Yard locations with columns for name, address, coordinates, maximum capacity, current Inventory_Count, and active status
5. THE Brick_Locations_Page SHALL provide an "Add Brick Factory" button to create new Brick_Factory locations
6. THE Brick_Locations_Page SHALL provide an "Add Company Yard" button to create new Company_Yard locations
7. WHEN adding a Brick_Factory, THE System SHALL require input of name, address, and geographic coordinates (latitude and longitude)
8. WHEN adding a Company_Yard, THE System SHALL require input of name, address, geographic coordinates, and maximum storage capacity
9. THE Brick_Locations_Page SHALL provide an edit button for each location to modify its details
10. THE Brick_Locations_Page SHALL provide a toggle button for each location to mark it as active or inactive
11. THE Brick_Locations_Page SHALL display the current Inventory_Count for each Company_Yard in real-time
12. THE Brick_Locations_Page SHALL provide a "View Inventory History" button for each Company_Yard to display inventory change records
13. THE Brick_Locations_Page SHALL provide a "Manual Adjustment" button for each Company_Yard to manually adjust Inventory_Count
14. WHEN performing a manual inventory adjustment, THE System SHALL require input of adjustment quantity (positive or negative) and a reason note
15. THE System SHALL prevent deletion of Brick_Factory or Company_Yard locations that are referenced in existing orders
16. THE System SHALL display a warning message when attempting to delete a location that is referenced in orders
17. THE Brick_Locations_Page SHALL support searching and filtering locations by name or address
18. THE Brick_Locations_Page SHALL be accessible only to users with admin or manager roles

