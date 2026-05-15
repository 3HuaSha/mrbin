import csv

data = """15-May-26	Fri	5 月	SOT13144	L20-12	5/15/2026 AM	Gurdeep	SAME	拉40YD, 送20YD垃圾桶	1	送	67 Jacob Keffer Pkwy, Vaughan, ON L4K 5N8	W	416-878-8877					TRUE			FALSE		FALSE									FALSE				Vaughan			W	29 km	50 min
15-May-26	Fri	5 月	SOT13145	40-15	5/15/2026 AM	Gurdeep	SAME	換40YD垃圾桶	3	送	2065 Midland Ave, Scarborough, ON M1P 4P8	C	437-299-2228					FALSE	FALSE		FALSE		FALSE		FALSE							FALSE				Scarborough			C	12 km	25 min
15-May-26	Fri	5 月	SOT13146		5/15/2026 AM	Gurdeep	SAME	換40YD垃圾桶	5	送	2065 Midland Ave, Scarborough, ON M1P 4P8	C	437-299-2228					FALSE	FALSE		FALSE		FALSE		FALSE							FALSE				Scarborough			C	12 km	25 min
15-May-26	Fri	5 月	SOT13150		5/15/2026 3-5PM	Gurdeep	CONFIRM ON SITE	40YD GARBAGE BIN	7	送	520 Industrial Pkwy S, Aurora, ON L4G 3W7	N	416-991-9719					FALSE	FALSE		FALSE		FALSE		FALSE							FALSE				Aurora			N	33 km	40 min
15-May-26	Fri	5 月	SOA01232		5/15/2026 AM	Jason	DRIVEWAY	4YD GRAVEL	1	送	27 Polarlights Way, Scarborough, ON M1X 1Z4	C	647-657-2155					TRUE			FALSE		FALSE									FALSE				Scarborough			C	12 km	25 min
15-May-26	Fri	5 月	SOT13151	14-72	5/15/2026 AM	Jason	CONFIRM ON SITE	14YD垃圾桶	2	送	42 Ulysses Pl, Scarborough, ON M1V 1H9	C	416-890-8667					TRUE	FALSE		FALSE		FALSE		FALSE							FALSE				Scarborough			C	12 km	25 min
15-May-26	Fri	5 月	SOT13141		5/15/2026 AM	Jason	DRIVEWAY	14YD垃圾桶	5	送	21 Sheldon Dr, Ajax, ON L1T 4K7	E	647-866-3892					FALSE			FALSE		FALSE									FALSE				Ajax			E	45 km	40 min
15-May-26	Fri	5 月	SOR00006		5/15/2026 7-9AM	坤	delivery 現場收押金$1585	ER620H (2 days)	1	送	141 Castle Crescent, Oakville, ON L6J 5H3	SW	416-998-2079					FALSE			FALSE		FALSE									FALSE				Oakville			SW	67 km	75 min
15-May-26	Fri	5 月	SOT13143		5/15/2026 9-11AM	坤	Facing house right side of driveway	20YD GARBAGE BIN	2	送	67 Princess Ave, North York, ON M2N 3R5	SW	416-436-7299 / 403-853-2586					FALSE			FALSE		FALSE									FALSE				North York			SW	15 km	40 min
15-May-26	Fri	5 月	SOT13147		5/15/2026 12-2PM	坤	Center of the driveway HINO	20YD GARBAGE BIN	4	送	41 Galsworthy Dr, Markham, ON L3P 1T2	C	416-931-3898 / 416-505-8837					FALSE	FALSE		FALSE		FALSE		FALSE							FALSE				Markham			C	10 km	20 min
15-May-26	Fri	5 月	D09697	14-87	2026/5/15 before 12PM	成	桶放路邊, 收$787	14YD 土桶 + 5YD SCREENING	1	送	62 Busch Ave, Markham, ON L6C 0R8	C	647-271-7929		3445	LR92620		TRUE	TRUE		TRUE		FALSE									FALSE				Markham			C	10 km	20 min
15-May-26	Fri	5 月	D09696	14-90	5/15/2026 9-10AM	成	桶放路邊，料放车道, 收$250 当天拉走	14YD 土桶	2	送	544 Forsyth Farm Dr, Whitchurch-Stouffville, ON L4A 0N3	N	437-770-7368	$250.00				TRUE			FALSE		FALSE									FALSE				Stouffville			N	25 km	35 min
15-May-26	Fri	5 月	SOB108612		5/15/2026 9-10AM	成	Customer will be there	11YD Gravel + 3YD crush run	2	送	544 Forsyth Farm Dr, Whitchurch-Stouffville, ON L4A 0N3	N	416-219-8133					TRUE	FALSE		FALSE		FALSE		FALSE							FALSE				Stouffville			N	25 km	35 min
15-May-26	Fri	5 月	SOT13098		5/15/2026 9-11AM	成	DRIVEWAY, put wood underneath	換14YD垃圾桶	3	送	241 East St, Holland Landing, ON L9N 1K8	N	289-500-3373					FALSE			FALSE		FALSE									FALSE				Holland Landing			N	44 km	50 min
15-May-26	Fri	5 月	SOT13153		5/15/2026 PM ASAP		DRIVEWAY	14YD垃圾桶		送	30 Alanadale Ave, Markham, ON L3P 1S3		647-972-9866					FALSE	FALSE		FALSE		FALSE		FALSE							FALSE				Markham			C	10 km	20 min
15-May-26	Fri	5 月						換14YD垃圾桶		送	12441							FALSE	FALSE		FALSE		FALSE		FALSE							FALSE
15-May-26	Fri	5 月	D09698		5/15/2026 NOON	Jason	receive $815	14YD GRAVEL	4	送	58 Adams Dr, Ajax, ON L1S 5V2	E	416-902-9357					FALSE			FALSE		FALSE									FALSE				Ajax			E	45 km	40 min
15-May-26	Fri	5 月	SOT13157		5/15/2026 PM ASAP		SAME, 客人要求盡量贴近LOADING DOCK	換20YD垃圾桶		送	Unit 369,200 Silver Star Blvd, Scarborough, ON M1V 5H4		647-339-1027 / 416-930-3905					FALSE	FALSE		FALSE		FALSE		FALSE							FALSE				Scarborough
15-May-26	Fri	5 月								送								FALSE	FALSE		FALSE		FALSE		FALSE							FALSE
15-May-26	Fri	5 月								送								FALSE	FALSE		FALSE		FALSE		FALSE							FALSE
15-May-26	Fri	5 月								送								FALSE			FALSE		FALSE									FALSE
15-May-26	Fri	5 月								收								FALSE			FALSE		FALSE									FALSE
15-May-26	Fri	5 月	SOT12692	20-44	5/14 CAN	坤	HINO	20YD 垃圾桶	3	收	32 Sisina Ave, Markham, ON L6C 0H6	C	647-204-8324					FALSE			FALSE		FALSE	SOT12692	FALSE	Pending Billing		$248.60	248.6	SOT12692收		FALSE		32 Sisina Ave, Markham	32 Sisina Ave	Markham	L6C 0H6	32 Sisina Ave, Markham, ON L6C 0H6	C	10 km	20 min
15-May-26	Fri	5 月	SOT12776	20-06	5/15 MUST			20YD 垃圾桶		收	262 Orr Dr, Bradford, ON L3Z 0B9	N	647-388-8089					FALSE			FALSE		FALSE	SOT12776	FALSE	Pending Billing		$361.60	361.6	SOT12776收		FALSE		262 Orr Dr, Bradford	262 Orr Dr	Bradford	L3Z 0B9	262 Orr Dr, Bradford, ON L3Z 0B9	N	56 km	65 min
15-May-26	Fri	5 月	SOT12807	20-42	5/15 MUST	坤		20YD 垃圾桶	5	收	49 Eastwood Crescent, Markham, ON L3P 6A1	C	416-315-0069					FALSE			FALSE		FALSE	SOT12807	FALSE	Pending Billing		$220.00	220	SOT12807收	20YD GARBAGE	FALSE		49 Eastwood Crescent, Markham	49 Eastwood Crescent	Markham	L3P 6A1	49 Eastwood Crescent, Markham, ON L3P 6A1	C	10 km	20 min
15-May-26	Fri	5 月	D09687	14-24	5/15 1-3PM MUST	Jason		14YD土桶	5	收	15 Guytoi Ct, North York, ON M3C 1Y1	SW	647-836-6633					FALSE			FALSE		FALSE	D09687	FALSE					D09687收		FALSE				North York			SW	15 km	40 min
15-May-26	Fri	5 月	SOT13052	14-38	5/15 AM MUST	Jason		14YD ASPHALT BIN	3	收	740 York Mills Rd, North York, ON M3B 1W8	SW	416-995-3376					TRUE			FALSE		FALSE	SOT13052	FALSE	Pending Billing		$508.50	508.5	SOT13052收		FALSE		740 York Mills Rd, North York	740 York Mills Rd	North York	M3B 1W8	740 York Mills Rd, North York, ON M3B 1W8	SW	15 km	40 min
15-May-26	Fri	5 月	SOT12735	40-15		Gurdeep		40YD 垃圾桶	2	收	67 Jacob Keffer Pkwy, Vaughan, ON L4K 5N8	W	416-878-8877		Draglam	TDW0614004	9.35	TRUE			FALSE	10.29	FALSE	SOT12735	FALSE	Pending Billing		$250.00	250	SOT12735收	40YD GARBAGE	FALSE		67 Jacob Keffer Pkwy, Vaughan	67 Jacob Keffer Pkwy	Vaughan	L4K 5N8	67 Jacob Keffer Pkwy, Vaughan, ON L4K 5N8	W	29 km	50 min
15-May-26	Fri	5 月	SOT13021	40-23		Gurdeep		40YD 垃圾桶	4	收	2065 Midland Ave, Scarborough, ON M1P 4P8	C	437-299-2228		YORK 1	NU161291	2.61	TRUE			FALSE	2.87	FALSE	SOT13021	FALSE	Pending Billing		$250.00	250	SOT13021收	40YD GARBAGE	FALSE		2065 Midland Ave, Scarborough	2065 Midland Ave	Scarborough	M1P 4P8	2065 Midland Ave, Scarborough, ON M1P 4P8	C	12 km	25 min
15-May-26	Fri	5 月	SOT13022	40-03		Gurdeep		40YD 垃圾桶	6	收	2065 Midland Ave, Scarborough, ON M1P 4P8	C	437-299-2228					FALSE			FALSE		FALSE	SOT13022	FALSE	Pending Billing		$250.00	250	SOT13022收	40YD GARBAGE	FALSE		2065 Midland Ave, Scarborough	2065 Midland Ave	Scarborough	M1P 4P8	2065 Midland Ave, Scarborough, ON M1P 4P8	C	12 km	25 min
15-May-26	Fri	5 月	SOT12884	14-92		成		14YD垃圾桶	4	收	241 East St, Holland Landing, ON L9N 1K8	N	289-500-3373					FALSE			FALSE		FALSE	SOT12884	FALSE	Pending Billing		$200.00	200	SOT12884收	14YD GARBAGE	FALSE		241 East St, Holland Landing	241 East St	Holland Landing	L9N 1K8	241 East St, Holland Landing, ON L9N 1K8	N	44 km	50 min
15-May-26	Fri	5 月	SOT12551	14-15	5/15 OR 5/16 CAN		HINO	14YD垃圾桶		收	92 Granada Crescent, Scarborough, ON M1B 2H5	C	647-231-3366					FALSE			FALSE		FALSE	SOT12551	FALSE	Pending Billing		$226.00	226	SOT12551收		FALSE		92 Granada Crescent, Scarborough	92 Granada Crescent	Scarborough	M1B 2H5	92 Granada Crescent, Scarborough, ON M1B 2H5	C	12 km	25 min
15-May-26	Fri	5 月	SOT13042	20-53				20YD 垃圾桶		收	Unit 369,200 Silver Star Blvd, Scarborough, ON M1V 5H4	C	647-339-1027 / 416-930-3905					FALSE			FALSE		FALSE	SOT13042	FALSE	Pending Billing		$248.60	248.6	SOT13042收		FALSE		Unit 369,200 Silver Star Blvd, Scarborough	Unit 369,200 Silver Star Blvd	Scarborough	M1V 5H4	Unit 369,200 Silver Star Blvd, Scarborough, O	C	12 km	25 min"""

with open(r'c:\Users\MrBin\Desktop\task1\Orders_Log_2026.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['日期', '星期', '月', '单号', '桶号', '时间', '司机', '备注1', '内容', '序号', '动作', '地址', '区域', '电话', 'AF_COL_PLACEHOLDER_FOR_CSV'])
    for line in data.strip().split('\n'):
        writer.writerow(line.split('\t'))
