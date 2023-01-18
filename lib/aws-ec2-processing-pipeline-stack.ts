import { Construct } from "constructs";
import { Stack, StackProps, CfnOutput, Duration } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_sqs as sqs } from 'aws-cdk-lib';
import { custom_resources as custom_resource } from 'aws-cdk-lib';
import { aws_autoscaling as autoscaling } from 'aws-cdk-lib';
import { aws_ecs_patterns as ecsPatterns } from 'aws-cdk-lib';
import { aws_cloudwatch as cloudwatch } from 'aws-cdk-lib';
import { Aws } from "aws-cdk-lib";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AwsEc2ProcessingPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);


    const vpc = new ec2.Vpc(this, `ProcessingVPC-${id}`, {
      // cidr: "11.192.0.0/16",
      ipAddresses: ec2.IpAddresses.cidr("11.192.0.0/16"),
      maxAzs: 2,
      // No Nat Gateways by default, but can easily change it here.
      natGateways: 0,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      /**
       * Each entry in this list configures a Subnet Group
       *
       * PRIVATE_ISOLATED: Isolated Subnets do not route traffic to the Internet (in this VPC).
       * PRIVATE_WITH_NAT.: Subnet that routes to the internet, but not vice versa.
       * PUBLIC..: Subnet connected to the Internet.
       */
      subnetConfiguration: [
        // {
        //   cidrMask: 24,
        //   name: 'nat',
        //   subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        // },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ],
    });

    const sqsQueue = new sqs.Queue(this, 'queue', {});

    const ec2Role = new iam.Role(this, 'MyRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    sqsQueue.grantConsumeMessages(ec2Role);

    // Should really just turn this into a daemon, but for now this does the job.
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'sudo yum install -y awscli', // install AWS CLI
      // `echo export AWS_QUEUE_URL="${sqsQueue.queueUrl}" >> /etc/profile`, // Push in Queue URL
      // `echo export AWS_REGION="${Aws.REGION}" >> /etc/profile`, // Push in Region for aws CLI
      // read a single message from the queue every one minute.
      `(crontab -l 2>/dev/null || echo ""; echo "* * * * * while sleep 1; do aws sqs receive-message --region ${Aws.REGION} --queue-url ${sqsQueue.queueUrl}; done") | crontab -`,
    );

    const launchTemplate = new ec2.LaunchTemplate(this, 'ASG-LaunchTemplate', {
      instanceType: new ec2.InstanceType('t3.nano'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      userData: userData,
      keyName: process.env.KEY_NAME || 'shafkevi',
      role: ec2Role,
    });

    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      groupMetrics: [autoscaling.GroupMetrics.all()],
      vpcSubnets: {
        // Use any public subnet,
        subnetType: ec2.SubnetType.PUBLIC,
        // Use these specific subnets
        // subnets: vpc.publicSubnets,
      },
      launchTemplate: launchTemplate,
      minCapacity: 1,
      maxCapacity: 5,
    });


    // CFN doesn't support this yet.
    // const sqsMetric = new cloudwatch.Metric({
    //   namespace: 'AWS/SQS',
    //   metricName: 'ApproximateNumberOfMessagesVisible',
    //   dimensionsMap: {
    //     Name: "QueueName",
    //     Value: sqsQueue.queueName,
    //   },
    //   statistic: "avg",
    //   period: Duration.minutes(1),
    // });
    // const asgMetric = new cloudwatch.Metric({
    //   namespace: 'AWS/AutoScaling',
    //   metricName: 'GroupInServiceInstances',
    //   dimensionsMap: {
    //     Name: "AutoScalingGroupName",
    //     Value: autoScalingGroup.autoScalingGroupName,
    //   },
    //   statistic: "avg",
    //   period: Duration.minutes(1)
    // });
    // // Need to do a custom resource...
    // // CFN doesn't support MathExpressions for TargetTrackingPolicies yet.
    // const computedMetric = new cloudwatch.MathExpression({
    //   expression: "messages / instances",
    //   usingMetrics: {
    //     messages: sqsMetric,
    //     instances: asgMetric,
    //   },
    //   period: Duration.minutes(1),
    // });


    // This isn't working for some reason. Probably SDK version differences...
    // const sqsTargetTrackingScalingPolicy = new custom_resource.AwsCustomResource(this, 'SQSTargetTrackingScalingPolicyCR', {
    //   onUpdate: {
    //     service: 'AutoScaling',
    //     action: 'putScalingPolicy',
    //     physicalResourceId: custom_resource.PhysicalResourceId.of(Date.now().toString()),
    //     parameters: {
    //       AutoScalingGroupName: autoScalingGroup.autoScalingGroupName,
    //       PolicyName: 'sqs-target-tracking-scaling-policy-v1',
    //       PolicyType: 'TargetTrackingScaling',
    //       TargetTrackingConfiguration: {
    //         "CustomizedMetricSpecification": {
    //           "Metrics": [
    //             {
    //               "Label": "Get the queue size (the number of messages waiting to be processed)",
    //               "Id": "m1",
    //               "MetricStat": {
    //                 "Metric": {
    //                   "MetricName": "ApproximateNumberOfMessagesVisible",
    //                   "Namespace": "AWS/SQS",
    //                   "Dimensions": [
    //                     {
    //                       "Name": "QueueName",
    //                       "Value": sqsQueue.queueName,
    //                     }
    //                   ]
    //                 },
    //                 "Stat": "Sum"
    //               },
    //               "ReturnData": false
    //             },
    //             {
    //               "Label": "Get the group size (the number of InService instances)",
    //               "Id": "m2",
    //               "MetricStat": {
    //                 "Metric": {
    //                   "MetricName": "GroupInServiceInstances",
    //                   "Namespace": "AWS/AutoScaling",
    //                   "Dimensions": [
    //                     {
    //                       "Name": "AutoScalingGroupName",
    //                       "Value": autoScalingGroup.autoScalingGroupName,
    //                     }
    //                   ]
    //                 },
    //                 "Stat": "Average"
    //               },
    //               "ReturnData": false
    //             },
    //             {
    //               "Label": "Calculate the backlog per instance",
    //               "Id": "e1",
    //               "Expression": "m1 / m2",
    //               "ReturnData": true
    //             }
    //           ]
    //         },
    //         "TargetValue": 1
    //       }
    //     }
    //   },
    //   onDelete: {
    //     service: 'AutoScaling',
    //     action: 'deletePolicy',
    //     parameters: {
    //       AutoScalingGroupName: autoScalingGroup.autoScalingGroupName,
    //       PolicyName: 'sqs-target-tracking-scaling-policy-v1',
    //     }
    //   },
    //   policy: custom_resource.AwsCustomResourcePolicy.fromSdkCalls({
    //     resources: custom_resource.AwsCustomResourcePolicy.ANY_RESOURCE,
    //   }),
    // });
    // const sqsTargetTrackingScalingPolicy = new autoscaling.TargetTrackingScalingPolicy(this, 'SQSTargetTrackingScalingPolicy', {
    //   autoScalingGroup: autoScalingGroup,
    //   targetValue: 2,
    //   customMetric: computedMetric,
    // });

    // create launch config (or launch template)
    // create auto scaling group
    // create target tracking policy and attach to auto scaling group
    // profit

  }
}
